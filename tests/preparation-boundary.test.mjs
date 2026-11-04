import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, linkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertLocalPreparation } from "../tools/lib/preparation-boundary.mjs";
import { runRefresh } from "../tools/refresh.mjs";

test("preparation rejects production paths, symlink aliases and hard links before writes",()=>{
  const root=mkdtempSync(join(tmpdir(),"zforum-boundary-"));
  try {
    const db=join(root,"draft.sqlite");writeFileSync(db,"draft");
    assert.doesNotThrow(()=>assertLocalPreparation(db,join(root,"new","artifacts")));
    const alias=join(root,"root-alias");symlinkSync("/",alias);
    for(const protectedRoot of ["data","app"])for(const suffix of ["","/zforum.sqlite","/work/imports","/new/nested/file"]) {
      for(const path of [`/${protectedRoot}${suffix}`,`${alias}/${protectedRoot}${suffix}`]) {
        assert.throws(()=>assertLocalPreparation(path),{message:`Preparation refuses production storage: ${path}`});
      }
    }
    const linked=join(root,"linked.sqlite");linkSync(db,linked);
    const symbolic=join(root,"symbolic.sqlite");symlinkSync(linked,symbolic);
    for(const path of [db,linked,symbolic])assert.throws(()=>assertLocalPreparation(path),{message:`Preparation refuses hard-linked file: ${path}`});
    const dangling=join(root,"dangling");symlinkSync('/data/missing-import-db.sqlite',dangling);
    assert.throws(()=>assertLocalPreparation(dangling),{code:'ENOENT'});
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("all preparation entry points refuse the production runtime before creating artifacts",()=>{
  const root=mkdtempSync(join(tmpdir(),"zforum-runtime-boundary-"));
  try {
    const db=join(root,"must-not-exist.sqlite");
    const invocations=[
      ['tools/import.mjs','fetch','--db',db],
      ['tools/import.mjs','analyze','--max-calls','1','--db',db],
      ['tools/import-transfer.mjs','analyze',join(root,'absent.json'),'1'],
      ...['fetch','refresh','analyze','discover','week'].map(command=>['tools/refresh.mjs',command,'--run','boundary-refused','--db',db,...(['refresh','analyze','week'].includes(command)?['--agent','codex','--model','fixture','--candidate','test']:[])])
    ];
    for(const environment of [{FLY_APP_NAME:'zencash'},{NODE_ENV:'production'},{ZFORUM_ORIGIN:'https://zenzcash.com'}])for(const args of invocations) {
      const result=spawnSync(process.execPath,args,{env:{...process.env,...environment},encoding:'utf8',timeout:10000});
      assert.equal(result.status,1,`${args.join(' ')}: ${result.stderr}`);
      assert.match(result.stderr,/Preparation is forbidden in the production runtime; use a separate local database backup/);
      assert.equal(existsSync(db),false);
    }
    for(const stage of ['fetch','analyze','refresh','week','discover']) {
      const result=spawnSync('bash',['scripts/production-import',stage],{encoding:'utf8',timeout:10000});
      assert.equal(result.status,1);
      assert.equal(result.stderr,'Preparation is forbidden in production; use a separate local database backup\n');
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("legacy refresh rejects production targets before network or report creation",async()=>{
  for(const command of ['fetch','refresh','analyze','discover','week']) {
    await assert.rejects(runRefresh({command,run:'boundary-refused',db:'/data/zforum.sqlite'},()=>assert.fail('production network request')),
      {message:'Preparation refuses production storage: /data/zforum.sqlite'});
  }
  assert.equal(existsSync(resolve('work/refresh/boundary-refused')),false);
});
