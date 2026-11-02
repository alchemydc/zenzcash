use crate::{database::Database, merge::MergeRequest};
use serde_json::{Value,json};
use std::path::Path;
const ACCOUNT:&str="11111111-1111-4111-8111-111111111111";
fn source(topic:&str,id:u64)->Value{
    json!({"format":crate::SITE_DATA_FORMAT,"models":["test"],"source_sha256":"fingerprint","topic":{"id":topic,"threads":[{"id":id,"posts":[{"key":format!("{id}/1"),"number":1,"hidden":false,"raw":"original","own_text":"original","segments":[],"reply_to":null,"author":"alice","created_at":"2026-11-01T00:00:00Z","analysis":{"neutral_rendition":"rewrite"}}]}]}})
}
fn setup()->(Database,Value){
    let mut db=Database::open(Path::new(":memory:")).unwrap();db.create_account(ACCOUNT).unwrap();
    let mut expected=serde_json::Map::new();let mut threads=Vec::new();
    for id in [7,8]{
        let topic=format!("thread-{id}");let release=db.publish(source(&topic,id)).unwrap();expected.insert(topic.clone(),json!(release));
        threads.push(db.published(&topic).unwrap()["topic"]["threads"][0].clone());
        db.connection.execute("INSERT INTO import_topics(topic) VALUES(?1)",[&topic]).unwrap();
        db.connection.execute("INSERT INTO import_threads VALUES(?1,?2)",rusqlite::params![id,topic]).unwrap();
    }
    db.publish(source("unrelated",10)).unwrap();
    threads.push(source("new",9)["topic"]["threads"][0].clone());
    let raw:Vec<Value>=threads.iter().map(|t|{
        let id=t["id"].as_u64().unwrap();let mut p=t["posts"][0].clone();p["forum_id"]=json!(id*100+1);p["username"]=p["author"].clone();
        json!({"id":id,"posts":[p]})
    }).collect();
    let fingerprints:serde_json::Map<String,Value>=[7,8,9].into_iter().map(|id|((id*100+1).to_string(),json!("a".repeat(64)))).collect();
    let data=json!({"format":crate::SITE_DATA_FORMAT,"models":["test"],"source_sha256":"fingerprint","topic":{"id":"funding","threads":threads}});
    let plan=json!({"expected_releases":expected,"snapshot":{"topic":"funding","source_sha256":"fingerprint","threads":raw},"summary":{"topic":"funding"},"fingerprints":fingerprints});
    (db,json!({"data":data,"plan":plan}))
}
#[test]
fn merge_reassigns_membership_atomically_and_preserves_personal_state(){
    let (mut db,request)=setup();
    db.set_reading(ACCOUNT,"7/1",Some(true),Some(true)).unwrap();
    db.set_mood(ACCOUNT,"7/1",Some(1)).unwrap();
    let personal=db.personal(ACCOUNT).unwrap();
    let original=db.published("thread-7").unwrap();let unrelated=db.published("unrelated").unwrap();
    let id=db.merge(serde_json::from_value(request).unwrap()).unwrap();
    let grouped=db.published("funding").unwrap();
    assert_eq!(grouped["release_id"],id);
    assert_eq!(grouped["topic"]["threads"][0]["posts"],original["topic"]["threads"][0]["posts"]);
    assert_eq!(db.personal(ACCOUNT).unwrap(),personal);
    assert_eq!(db.published("unrelated").unwrap(),unrelated);
    assert!(!db.has_release("thread-7").unwrap());assert!(!db.has_release("thread-8").unwrap());
    assert_eq!(db.catalog().unwrap()["topics"].as_array().unwrap().len(),2);
    assert_eq!(db.connection.query_row("SELECT count(*) FROM import_threads WHERE topic='funding'",[],|r|r.get::<_,u64>(0)).unwrap(),3);
    assert_eq!(db.connection.query_row("SELECT count(*) FROM import_topics WHERE topic IN ('thread-7','thread-8')",[],|r|r.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.connection.query_row("SELECT count(*) FROM import_posts",[],|r|r.get::<_,u64>(0)).unwrap(),3);
    assert_eq!(db.connection.query_row("SELECT count(*) FROM current_posts",[],|r|r.get::<_,u64>(0)).unwrap(),4);
    assert_eq!(db.connection.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
}
#[test]
fn refused_merges_roll_back_every_topic_and_membership_change(){
    for case in ["stale","omitted","changed","owner","fingerprint","active"]{
        let (mut db,mut request)=setup();
        let expected=match case{
            "stale"=>{request["plan"]["expected_releases"]["thread-7"]=json!("stale");"merge source topic thread-7 changed; prepare again"},
            "omitted"=>{request["data"]["topic"]["threads"].as_array_mut().unwrap().remove(1);request["plan"]["snapshot"]["threads"].as_array_mut().unwrap().remove(1);"merge omits a thread from thread-8"},
            "changed"=>{request["data"]["topic"]["threads"][0]["posts"][0]["analysis"]["neutral_rendition"]=json!("changed");"merge changes published posts in thread-7; update them separately"},
            "owner"=>{db.connection.execute("INSERT INTO import_topics(topic) VALUES('other')",[]).unwrap();db.connection.execute("INSERT INTO import_threads VALUES(9,'other')",[]).unwrap();"thread 9 belongs to another tracked topic"},
            "fingerprint"=>{request["plan"]["fingerprints"]["901"]=json!("bad");"invalid source fingerprint for forum post 901"},
            "active"=>{db.connection.execute("INSERT INTO import_runs VALUES('run','start','end','running','{}')",[]).unwrap();"finish the active import before merging topics"},
            _=>unreachable!()
        };
        let before=db.catalog().unwrap();
        let topics=db.connection.query_row("SELECT count(*) FROM import_topics",[],|r|r.get::<_,u64>(0)).unwrap();
        let releases=db.connection.query_row("SELECT count(*) FROM releases",[],|r|r.get::<_,u64>(0)).unwrap();
        let parsed:MergeRequest=serde_json::from_value(request).unwrap();
        assert_eq!(db.merge(parsed).unwrap_err(),expected,"{case}");
        assert_eq!(db.catalog().unwrap(),before,"{case}");
        assert_eq!(db.connection.query_row("SELECT count(*) FROM import_topics",[],|r|r.get::<_,u64>(0)).unwrap(),topics,"{case}");
        assert_eq!(db.connection.query_row("SELECT count(*) FROM releases",[],|r|r.get::<_,u64>(0)).unwrap(),releases,"{case}");
        assert_eq!(db.connection.query_row("SELECT count(*) FROM import_posts",[],|r|r.get::<_,u64>(0)).unwrap(),0,"{case}");
    }
}
