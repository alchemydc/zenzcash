import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { consistentBackup, inspectDatabase } from "../tools/lib/database-backup.mjs";
import { seedDatabase } from "../tools/seed-database.mjs";
import { backupCredentials, backupToTigris } from "../tools/backup.mjs";
import { runProcess } from "../tools/lib/process.mjs";
import { readingContract } from "../tools/build-runtime.mjs";
import { verifyLatestBackup } from "../tools/verify-backup.mjs";
import { ids, TONE_BANDS, SUPPORT_BANDS, POST_VERSIONS } from "../site/js/reader-options.js";
import { INTEREST_IDS } from "../site/js/vocab.js";

function database(path) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE published(topic TEXT PRIMARY KEY); CREATE TABLE current_posts(id TEXT PRIMARY KEY); CREATE TABLE accounts(id TEXT PRIMARY KEY, credential TEXT); CREATE TABLE bookmarks(account TEXT REFERENCES accounts(id),post TEXT); PRAGMA user_version=5;");
  db.exec("INSERT INTO published VALUES('funding'); INSERT INTO current_posts VALUES('7/1'); INSERT INTO accounts VALUES('reader','credential-to-preserve'); INSERT INTO bookmarks VALUES('reader','7/1');");
  return db;
}
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const expected = {schema:5,topics:1,posts:1,accounts:1};
const env = {AWS_ACCESS_KEY_ID:"test-key",AWS_SECRET_ACCESS_KEY:"test-secret",BUCKET_NAME:"test-backups",AWS_ENDPOINT_URL_S3:"https://fly.storage.tigris.dev"};

test("runtime contract builds deterministically with only tracked browser source",()=>{
  assert.deepEqual(readingContract(),{toneBands:ids(TONE_BANDS),supportBands:ids(SUPPORT_BANDS),postVersions:ids(POST_VERSIONS),preferredVersion:["neutral","original"],threadView:["all","thread"],postOrder:["newest","oldest"],interests:INTEREST_IDS});
  assert.equal(JSON.stringify(readingContract()),JSON.stringify(readingContract()));
});

test("deployment reserves measured import headroom and bounds the operator heap",()=>{
  const fly=readFileSync(new URL('../fly.toml',import.meta.url),'utf8');
  const docker=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
  assert.deepEqual(fly.split('\n').filter(line=>/^\s*memory =/.test(line)),['  memory = "2gb"']);
  assert.deepEqual(docker.split('\n').filter(line=>line.startsWith('ENV NODE_OPTIONS=')),['ENV NODE_OPTIONS="--max-old-space-size=512"']);
});

test("consistent live WAL backup and exclusive seeding preserve content and personal state",async()=>{
  const root = mkdtempSync(join(tmpdir(),"zforum-seed-"));
  const source = join(root,"source.sqlite"),copy = join(root,"copy.sqlite"),seed = join(root,"seed.sqlite");
  const db = database(source);
  try {
    assert.deepEqual(await consistentBackup(source,copy),expected);
    assert.equal(statSync(copy).mode & 0o777,0o600);
    await assert.rejects(consistentBackup(source,copy),{message:`Backup destination already exists: ${copy}`});
    await assert.rejects(seedDatabase(copy,seed,"0".repeat(64)),{message:"Seed SHA-256 mismatch"});
    assert.deepEqual(await seedDatabase(copy,seed,hash(copy)),expected);
    const restored = new DatabaseSync(seed,{readOnly:true});
    assert.deepEqual(restored.prepare("SELECT * FROM accounts").all().map(row=>({...row})),[{id:"reader",credential:"credential-to-preserve"}]);
    assert.deepEqual(restored.prepare("SELECT * FROM bookmarks").all().map(row=>({...row})),[{account:"reader",post:"7/1"}]);
    restored.close();
    await assert.rejects(seedDatabase(copy,seed,hash(copy)),{message:`Refusing to replace existing database: ${seed}`});
    const occupied = join(root,"occupied.sqlite");writeFileSync(`${occupied}-wal`,"active");
    await assert.rejects(seedDatabase(copy,occupied,hash(copy)),{message:`Refusing to replace existing database: ${occupied}`});
    const malformed = join(root,"malformed.sqlite");writeFileSync(malformed,"garbage");
    assert.throws(()=>inspectDatabase(malformed),/not a database/);
    assert.deepEqual(inspectDatabase(source),expected);
  } finally { db.close();rmSync(root,{recursive:true,force:true}); }
});

test("backup uploads a restorable database and import artifacts with credentials only on stdin",async()=>{
  const root = mkdtempSync(join(tmpdir(),"zforum-backup-")),db = database(join(root,"zforum.sqlite"));
  mkdirSync(join(root,"work","imports"),{recursive:true});
  writeFileSync(join(root,"work","imports","checkpoint.json"),'{"frozen":"preserve"}');
  const uploaded = join(root,"uploaded.tar.gz");
  let uploads = 0;
  try {
    const result = await backupToTigris({data:root,env,run:async(binary,args,options)=>{
      if (binary !== "curl") return runProcess(binary,args,options);
      uploads++;
      assert.equal(args.includes("test-secret"),false);
      assert.equal(args.join(" ").includes("test-key"),false);
      assert.equal(options.input,'user = "test-key:test-secret"\n');
      assert.deepEqual(Object.keys(options.env).sort(),["LANG","PATH"]);
      assert.equal(args.at(-1).startsWith("https://fly.storage.tigris.dev/test-backups/zforum/"),true);
      copyFileSync(args[args.indexOf("--upload-file")+1],uploaded);
      return {stdout:"",stderr:""};
    }});
    assert.equal(uploads,1);assert.deepEqual(result.database,expected);
    const restore = join(root,"restore");mkdirSync(restore);
    await runProcess("tar",["-xzf",uploaded,"-C",restore]);
    assert.deepEqual(inspectDatabase(join(restore,"zforum.sqlite")),expected);
    assert.equal(readFileSync(join(restore,"imports","checkpoint.json"),"utf8"),'{"frozen":"preserve"}');
    assert.deepEqual(readdirSync(join(root,"backups")),["latest.json"]);
    const verified = await verifyLatestBackup({data:root,env,run:async(binary,args,options)=>{
      if (binary !== "curl") return runProcess(binary,args,options);
      copyFileSync(uploaded,args[args.indexOf("--output")+1]);
      return {stdout:"",stderr:""};
    }});
    assert.equal(verified.restored,true);assert.deepEqual(verified.database,expected);
    await assert.rejects(verifyLatestBackup({data:root,env,run:async(binary,args)=>{
      assert.equal(binary,"curl");writeFileSync(args[args.indexOf("--output")+1],"corrupt");
      return {stdout:"",stderr:""};
    }}),{message:"Downloaded backup SHA-256 differs from the uploaded archive"});
    const success = readFileSync(join(root,"backups","latest.json"),"utf8");
    await assert.rejects(backupToTigris({data:root,env,run:async(binary,args,options)=>{
      if (binary === "curl") throw new Error("upload refused");
      return runProcess(binary,args,options);
    }}),{message:"upload refused"});
    assert.equal(readFileSync(join(root,"backups","latest.json"),"utf8"),success);
    assert.deepEqual(readdirSync(join(root,"backups")),["latest.json"]);
  } finally { db.close();rmSync(root,{recursive:true,force:true}); }
});

test("backup refuses missing credentials, config injection and arbitrary destinations",()=>{
  for (const key of ["AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY"]) {
    for (const value of [undefined,"","bad\nconfig","bad\"config"]) assert.throws(()=>backupCredentials({...env,[key]:value}),{message:`Missing or invalid ${key}`});
  }
  assert.throws(()=>backupCredentials({...env,AWS_ENDPOINT_URL_S3:"https://attacker.example"}),{message:"AWS_ENDPOINT_URL_S3 must be https://fly.storage.tigris.dev"});
  assert.throws(()=>backupCredentials({...env,BUCKET_NAME:"../private"}),{message:"Missing or invalid BUCKET_NAME"});
});
