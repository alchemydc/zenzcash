use crate::database::Result;
use serde_json::{Value,json};
use std::collections::BTreeSet;

pub fn protect(data:Value,restricted:&BTreeSet<String>)->Result<Value>{
    let threads=data["topic"]["threads"].as_array().ok_or("published threads missing")?;
    let affected=threads.iter().flat_map(|t|t["posts"].as_array().into_iter().flatten()).any(|p|p["hidden"]==false&&p["key"].as_str().is_some_and(|key|restricted.contains(key)));
    if !affected{return Ok(data);}
    let mut originals=Vec::new();
    for thread in threads{
        let mut posts=Vec::new();
        for post in thread["posts"].as_array().ok_or("published posts missing")?{
            let key=post["key"].as_str().ok_or("published post key missing")?;
            let hidden=post["hidden"].as_bool().ok_or("published post visibility missing")?||restricted.contains(key);
            let mut original=json!({"key":key,"number":post["number"],"author":post["author"],"account":post["account"],"created_at":post["created_at"],"reply_to":post["reply_to"],"hidden":hidden,"analysis":null,"rendition_version":null});
            for field in ["raw","own_text","segments"]{original[field]=if hidden{Value::Null}else{post[field].clone()};}
            posts.push(original);
        }
        originals.push(json!({"id":thread["id"],"title":thread["title"],"url":thread["url"],"created_at":thread["created_at"],"posts":posts}));
    }
    Ok(json!({"format":data["format"],"release_id":data["release_id"],"snapshot_at":data["snapshot_at"],"source_sha256":data["source_sha256"],"forum_origin":data["forum_origin"],"feedback_version":data["feedback_version"],"visibility_pending":true,"models":[],"analysis_runs":[],"topic":{"id":data["topic"]["id"],"card":{"title":"Discussion","byline":"Public originals remain available while analysis is refreshed.","keywords":[],"interests":data["topic"]["card"]["interests"]},"headline":"Original discussion","overview":[],"points":[],"issues":[],"threads":originals}}))
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn every_restriction_subset_preserves_public_originals_and_excludes_derived_fields(){
        for mask in 0..256{
            let posts:Vec<Value>=(1..=8).map(|i|json!({"key":format!("7/{i}"),"number":i,"hidden":false,"raw":format!("source-{i}"),"own_text":format!("source-{i}"),"segments":[],"analysis":{"summary":"DERIVED_SECRET"},"analysis_run":{"private":"DERIVED_SECRET"}})).collect();
            let data=json!({"format":"zforum-design-4","private_extra":"DERIVED_SECRET","topic":{"id":"t","card":{"title":"DERIVED_SECRET","interests":["grants"]},"overview":["DERIVED_SECRET"],"points":["DERIVED_SECRET"],"issues":["DERIVED_SECRET"],"threads":[{"id":7,"assessment_context":"DERIVED_SECRET","posts":posts}]}});
            let blocked:BTreeSet<String>=(1..=8).filter(|i|mask&(1<<(i-1))!=0).map(|i|format!("7/{i}")).collect();
            let result=protect(data.clone(),&blocked).unwrap();
            if mask==0{assert_eq!(result,data);continue;}
            assert!(!result.to_string().contains("DERIVED_SECRET"));assert_eq!(result["visibility_pending"],true);
            for (index,post)in result["topic"]["threads"][0]["posts"].as_array().unwrap().iter().enumerate(){assert_eq!(post["analysis"],Value::Null);assert_eq!(post["hidden"],mask&(1<<index)!=0);if mask&(1<<index)!=0{assert_eq!(post["raw"],Value::Null);}else{assert_eq!(post["raw"],format!("source-{}",index+1));}}
        }
    }
}
