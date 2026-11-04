use crate::{database::{Database,hash},publication::PublicationRequest,SITE_DATA_FORMAT};
use serde_json::{Value,json};
use rusqlite::params;
use std::{path::Path,sync::{Arc,Barrier,atomic::{AtomicBool,Ordering}}};

fn content(id:u64,generation:u64)->Value{
    let topic=format!("thread-{id}");let text=format!("generation {generation}");
    json!({"format":SITE_DATA_FORMAT,"models":["fixture"],"source_sha256":hash(&text),"topic":{"id":topic,"card":{"title":"Fixture"},"headline":"Fixture","overview":[],"points":[],"issues":[],"threads":[{"id":id,"posts":[{"key":format!("{id}/1"),"number":1,"hidden":false,"raw":text,"own_text":text,"segments":[],"reply_to":null,"author":"alice","created_at":"2026-11-01T00:00:00Z","analysis":{"neutral_rendition":format!("rewrite {generation}")}}]}]}})
}
fn stage(db:&mut Database,count:u64,generation:u64)->Value{
    let run=format!("00000000-0000-4000-8000-{generation:012}");let until="2026-11-02T00:00:00.000Z";
    let mut stored=Vec::new();let mut topics=Vec::new();
    for id in 1..=count{
        let data=content(id,generation);let topic=format!("thread-{id}");
        db.connection.execute("INSERT OR IGNORE INTO import_topics(topic) VALUES(?1)",[&topic]).unwrap();
        let expected:Option<String>=db.connection.query_row("SELECT release FROM published WHERE topic=?1",[&topic],|r|r.get(0)).optional().unwrap();
        stored.push(json!({"id":topic,"threadIds":[id],"status":"analyzed","source_sha256":data["source_sha256"]}));
        let summary=json!({"task":"summary","topic":topic,"card":data["topic"]["card"],"headline":data["topic"]["headline"],"overview":[],"points":[],"issues":[]});
        topics.push(json!({"id":topic,"expected_release":expected,"data":data,"summary":summary}));
    }
    let state=json!({"id":run,"since":"2026-11-01T00:00:00.000Z","until":until,"scope_thread":null,"status":"running","discovery":{"threads":[]},"topics":stored});
    db.connection.execute("INSERT INTO import_runs VALUES(?1,?2,?3,'running',?4)",params![run,"2026-11-01T00:00:00.000Z",until,state.to_string()]).unwrap();
    json!({"format":"zforum-publication-1","run":run,"finished_at":"2026-11-03T00:00:00.000Z","topics":topics})
}
use rusqlite::OptionalExtension;
fn request(value:Value)->PublicationRequest{serde_json::from_value(value).unwrap()}
fn counts(db:&Database)->Vec<i64>{["releases","current_posts","source_revisions","renditions"].iter().map(|table|db.connection.query_row(&format!("SELECT count(*) FROM {table}"),[],|r|r.get(0)).unwrap()).collect()}

#[test]
fn atomic_import_commits_new_and_existing_topics_and_all_checkpoints(){
    for count in 0..=8{
        let mut db=Database::open(Path::new(":memory:")).unwrap();
        db.create_account("11111111-1111-4111-8111-111111111111").unwrap();
        for id in (1..=count).step_by(2){db.publish(content(id,0)).unwrap();}
        let packet=stage(&mut db,count,1);let run=packet["run"].as_str().unwrap().to_owned();
        let result=db.publish_import(request(packet)).unwrap();
        assert_eq!(result["status"],"complete");assert_eq!(result["topics"].as_array().unwrap().len(),count as usize);
        assert_eq!(db.connection.query_row("SELECT status FROM import_runs WHERE id=?1",[run],|r|r.get::<_,String>(0)).unwrap(),"complete");
        for id in 1..=count{let topic=format!("thread-{id}");assert_eq!(db.published(&topic).unwrap()["topic"]["threads"][0]["posts"][0]["raw"],"generation 1");let summary:String=db.connection.query_row("SELECT summary FROM import_topics WHERE topic=?1",[&topic],|r|r.get(0)).unwrap();assert_eq!(serde_json::from_str::<Value>(&summary).unwrap()["topic"],topic);}
        assert_eq!(db.connection.query_row("SELECT count(*) FROM accounts",[],|r|r.get::<_,i64>(0)).unwrap(),1);
    }
}

#[test]
fn every_failed_topic_rolls_back_prior_writes_and_completion(){
    for failed in 0..4{
        let mut db=Database::open(Path::new(":memory:")).unwrap();
        for id in 1..=4{db.publish(content(id,0)).unwrap();}
        let mut packet=stage(&mut db,4,1);let before=db.catalog().unwrap();let before_counts=counts(&db);
        packet["topics"][failed]["data"]["topic"]["threads"][0]["posts"][0]["hidden"]=json!(true);
        assert_eq!(db.publish_import(request(packet)).unwrap_err(),format!("hidden post {}/1 contains source or derived text",failed+1));
        assert_eq!(db.catalog().unwrap(),before);assert_eq!(counts(&db),before_counts);
        assert_eq!(db.connection.query_row("SELECT status FROM import_runs",[],|r|r.get::<_,String>(0)).unwrap(),"running");
        assert_eq!(db.connection.query_row("SELECT count(*) FROM import_topics WHERE summary IS NOT NULL",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    }
}

#[test]
fn atomic_import_rejects_stale_releases_and_strict_packet_errors(){
    let mut db=Database::open(Path::new(":memory:")).unwrap();db.publish(content(1,0)).unwrap();
    let packet=stage(&mut db,1,1);let mut missing=packet.clone();missing["topics"][0].as_object_mut().unwrap().remove("expected_release");
    assert!(serde_json::from_value::<PublicationRequest>(missing).err().unwrap().to_string().contains("missing field `expected_release`"));
    let mut unknown=packet.clone();unknown["unexpected"]=json!(true);assert!(serde_json::from_value::<PublicationRequest>(unknown).is_err());
    db.publish(content(1,2)).unwrap();
    assert_eq!(db.publish_import(request(packet)).unwrap_err(),"published content for thread-1 changed before atomic publication");
    assert_eq!(db.published("thread-1").unwrap()["topic"]["threads"][0]["posts"][0]["raw"],"generation 2");
}

#[test]
fn concurrent_catalog_reads_observe_one_complete_generation(){
    let directory=std::env::temp_dir().join(format!("zforum-atomic-{}",crate::database::secret()));std::fs::create_dir(&directory).unwrap();let path=directory.join("db.sqlite");
    let mut db=Database::open(&path).unwrap();for id in 1..=24{db.publish(content(id,0)).unwrap();}
    let barrier=Arc::new(Barrier::new(2));let done=Arc::new(AtomicBool::new(false));let ready=barrier.clone();let finished=done.clone();let writer_path=path.clone();
    let writer=std::thread::spawn(move||{let mut writer=Database::open(&writer_path).unwrap();ready.wait();for generation in 1..=20{let packet=stage(&mut writer,24,generation);writer.publish_import(request(packet)).unwrap();}finished.store(true,Ordering::Release);});
    barrier.wait();let mut reads=0;
    while !done.load(Ordering::Acquire)||reads<20{let catalog=db.catalog().unwrap();let values:BTreeSet<String>=catalog["topics"].as_array().unwrap().iter().map(|t|t["topic"]["threads"][0]["posts"][0]["raw"].as_str().unwrap().to_owned()).collect();assert_eq!(values.len(),1);assert_eq!(catalog["topics"].as_array().unwrap().len(),24);reads+=1;assert!(reads<10000);}
    writer.join().unwrap();drop(db);std::fs::remove_dir_all(directory).unwrap();
}
use std::collections::BTreeSet;

#[test]
fn json_preserves_finite_float_bits_across_exponents_and_mantissas(){
    let mut values=vec![189110.69533600006,15605.887876000023,27.543816000000334];
    for exponent in 0..2047_u64{
        for sign in [0_u64,1]{
            for mantissa in [0_u64,1,(1_u64<<51)-1,1_u64<<51,(1_u64<<52)-1]{
                values.push(f64::from_bits((sign<<63)|(exponent<<52)|mantissa));
            }
        }
    }
    let mut bits=0x6a09e667f3bcc909_u64;
    for _ in 0..10_000{
        bits^=bits<<13;bits^=bits>>7;bits^=bits<<17;
        let value=f64::from_bits(bits);
        if value.is_finite(){values.push(value);}
    }
    for value in values{
        assert!(value.is_finite());
        let text=serde_json::to_string(&value).unwrap();
        let parsed:Value=serde_json::from_str(&text).unwrap();
        assert_eq!(parsed.as_f64().unwrap().to_bits(),value.to_bits(),"first parse: {text}");
        let returned:Value=serde_json::from_str(&parsed.to_string()).unwrap();
        assert_eq!(returned.as_f64().unwrap().to_bits(),value.to_bits(),"response parse: {text}");
    }
}

#[test]
fn atomic_publication_preserves_fractional_timing_metadata_exactly(){
    for elapsed in [189110.69533600006_f64,15605.887876000023,27.543816000000334]{
        let mut db=Database::open(Path::new(":memory:")).unwrap();
        let packet=stage(&mut db,1,1);
        let text:String=db.connection.query_row("SELECT state FROM import_runs",[],|r|r.get(0)).unwrap();
        let mut state:Value=serde_json::from_str(&text).unwrap();
        state["elapsed_ms"]=json!(elapsed);state["topics"][0]["analysis_ms"]=json!(elapsed);
        db.connection.execute("UPDATE import_runs SET state=?1",[state.to_string()]).unwrap();
        let response=db.publish_import(request(packet)).unwrap();
        let stored:String=db.connection.query_row("SELECT state FROM import_runs",[],|r|r.get(0)).unwrap();
        for text in [response.to_string(),stored]{
            let roundtrip:Value=serde_json::from_str(&text).unwrap();
            assert_eq!(roundtrip["status"],"complete");
            assert_eq!(roundtrip["elapsed_ms"].as_f64().unwrap().to_bits(),elapsed.to_bits());
            assert_eq!(roundtrip["topics"][0]["analysis_ms"].as_f64().unwrap().to_bits(),elapsed.to_bits());
        }
    }
}
