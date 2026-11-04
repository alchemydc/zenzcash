use crate::database::{Database,Result};
use rusqlite::{OptionalExtension,params};
use serde::{Deserialize,Deserializer};
use serde_json::{Value,json};
use std::collections::BTreeSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicationRequest {
    pub format:String,
    pub run:String,
    pub finished_at:String,
    pub topics:Vec<PublicationTopic>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicationTopic {
    pub id:String,
    #[serde(deserialize_with="required_release")]
    pub expected_release:Option<String>,
    pub data:Value,
    pub summary:Value,
}
fn required_release<'de,D:Deserializer<'de>>(input:D)->std::result::Result<Option<String>,D::Error>{Option::<String>::deserialize(input)}
fn failure(error:impl std::fmt::Display)->String{format!("import publication: {error}")}

impl Database {
    pub fn publish_import(&mut self,request:PublicationRequest)->Result<Value>{
        if request.format!="zforum-publication-1" {return Err(format!("unsupported publication format {:?}",request.format));}
        let finished=chrono::DateTime::parse_from_rfc3339(&request.finished_at).map_err(failure)?;
        if finished.to_rfc3339_opts(chrono::SecondsFormat::Millis,true)!=request.finished_at{return Err(format!("noncanonical completion timestamp {:?}",request.finished_at));}
        self.connection.execute_batch("BEGIN IMMEDIATE").map_err(failure)?;
        let result=(||{
            let row:Option<(String,String)>=self.connection.query_row("SELECT status,state FROM import_runs WHERE id=?1",[&request.run],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(failure)?;
            let Some((status,text))=row else{return Err(format!("publication run {} does not exist",request.run));};
            if status=="complete"{return Err(format!("publication run {} is already complete",request.run));}
            let mut state:Value=serde_json::from_str(&text).map_err(failure)?;
            if !state["discovery"].is_object()||state["review"]["status"]=="pending"{return Err(format!("publication run {} has incomplete discovery/review",request.run));}
            let topics=state["topics"].as_array().ok_or("stored publication topics missing")?;
            if topics.len()!=request.topics.len()||topics.iter().zip(&request.topics).any(|(stored,incoming)|stored["id"]!=incoming.id){return Err(format!("publication membership differs for run {}",request.run));}
            let until=chrono::DateTime::parse_from_rfc3339(state["until"].as_str().ok_or("stored publication cutoff missing")?).map_err(failure)?;
            if finished<until{return Err(format!("publication completion {} precedes cutoff {}",request.finished_at,until));}
            let mut seen=BTreeSet::new();
            for (index,topic) in request.topics.iter().enumerate(){
                if !seen.insert(&topic.id){return Err(format!("duplicate publication topic {}",topic.id));}
                if !["analyzed","published"].iter().any(|status|state["topics"][index]["status"]==*status){return Err(format!("publication topic {} is not analyzed",topic.id));}
                let actual:Option<String>=self.connection.query_row("SELECT release FROM published WHERE topic=?1",[&topic.id],|r|r.get(0)).optional().map_err(failure)?;
                if actual!=topic.expected_release{return Err(format!("published content for {} changed before atomic publication",topic.id));}
                if topic.data["topic"]["id"]!=topic.id||topic.data["source_sha256"]!=state["topics"][index]["source_sha256"]{return Err(format!("publication source differs for {}",topic.id));}
                let thread_ids:Vec<Value>=topic.data["topic"]["threads"].as_array().ok_or("publication threads missing")?.iter().map(|t|t["id"].clone()).collect();
                if json!(thread_ids)!=state["topics"][index]["threadIds"]{return Err(format!("publication thread membership differs for {}",topic.id));}
                if topic.summary["task"]!="summary"||topic.summary["topic"]!=topic.id{return Err(format!("publication summary identity differs for {}",topic.id));}
                for field in ["card","headline","overview","issues"]{if topic.summary[field]!=topic.data["topic"][field]{return Err(format!("publication summary field {field} differs for {}",topic.id));}}
                let mut points=topic.data["topic"]["points"].clone();
                for point in points.as_array_mut().ok_or("publication points missing")?{point.as_object_mut().ok_or("publication point is not an object")?.remove("first_at");}
                if points!=topic.summary["points"]{return Err(format!("publication summary points differ for {}",topic.id));}
                // Visibility changes commit with the reviewed release, never during preparation.
                let mut visible=BTreeSet::new();let mut restricted=BTreeSet::new();
                for thread in topic.data["topic"]["threads"].as_array().ok_or("publication threads missing")?{
                    for post in thread["posts"].as_array().ok_or("publication posts missing")?{
                        let key=post["key"].as_str().ok_or("publication post key missing")?.to_owned();
                        if post["hidden"].as_bool().ok_or("publication hidden must be boolean")?{restricted.insert(key);}else{visible.insert(key);}
                    }
                }
                {
                    let mut query=self.connection.prepare("SELECT post FROM current_posts WHERE topic=?1 AND hidden=0").map_err(failure)?;
                    let previous=query.query_map([&topic.id],|row|row.get::<_,String>(0)).map_err(failure)?;
                    for key in previous{let key=key.map_err(failure)?;if !visible.contains(&key){restricted.insert(key);}}
                }
                self.restrict(&restricted.into_iter().collect::<Vec<_>>())?;
                let release=self.publish(topic.data.clone())?;
                self.connection.execute("UPDATE import_topics SET summary=?1 WHERE topic=?2",params![topic.summary.to_string(),topic.id]).map_err(failure)?;
                state["topics"][index]["release"]=json!(release);state["topics"][index]["status"]=json!("published");
            }
            state["status"]=json!("complete");state["finished_at"]=json!(request.finished_at);
            self.connection.execute("UPDATE import_runs SET status='complete',state=?1 WHERE id=?2",params![state.to_string(),request.run]).map_err(failure)?;
            Ok(state)
        })();
        match result{
            Ok(state)=>{self.connection.execute_batch("COMMIT").map_err(failure)?;Ok(state)}
            Err(error)=>{self.connection.execute_batch("ROLLBACK").map_err(|rollback|format!("{error}; rollback failed: {rollback}"))?;Err(error)}
        }
    }
}
