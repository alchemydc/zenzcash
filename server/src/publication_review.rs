//! CLI publication requires the exact reviewed file and current scan/acknowledgment.
use crate::database::hash;
use serde_json::Value;
use std::path::Path;

fn read(path:&Path) -> Result<String,String> {std::fs::read_to_string(path).map_err(|e|format!("publication review {}: {e}",path.display()))}
fn json(text:&str) -> Result<Value,String> {serde_json::from_str(text).map_err(|e|format!("publication review JSON: {e}"))}
fn matches(left:&Value,right:&Value,keys:&[&str]) -> bool {keys.iter().all(|key|left.get(*key).is_some()&&left.get(*key)==right.get(*key))}
fn digest(value:&Value) -> bool {value.as_str().is_some_and(|s|s.len()==64&&s.bytes().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(&c)))}
fn nonempty(value:&Value) -> bool {value.as_str().is_some_and(|s|!s.trim().is_empty())}
pub fn checked_file(file:&Path,directory:&Path) -> Result<Value,String> {
    let text=read(file)?;
    let receipt=json(&read(&directory.join("publication-review.json"))?)?;
    let meta=json(&read(&directory.join("source-scan.json"))?)?;
    let contract:Value=serde_json::from_str(include_str!("../../tools/lib/review-contract.json")).expect("embedded review contract valid");
    let keys=["scan_id","run","source_digest","candidate_digest","report_digest"];
    if receipt["format"]!="zforum-publication-review-1"||receipt["file_sha256"]!=hash(&text)||!matches(&receipt,&meta,&keys)
        ||meta["format"]!="zforum-source-scan-1"||meta["status"]!="complete"||meta["phase"]!="candidate"||meta["detector_version"]!=contract["detector_version"]
        ||!digest(&meta["source_digest"])||!digest(&meta["candidate_digest"])||!nonempty(&meta["run"])||!nonempty(&meta["scan_id"])
        ||meta["coverage"]["unavailable"].as_array().is_none_or(|items|!items.is_empty()) {
        return Err("Publication blocked: review is missing, incomplete or stale for this exact file; run the review workflow".into());
    }
    let count=meta["finding_count"].as_u64().ok_or("Publication blocked: missing scan finding count")?;
    let report_path=directory.join("suspicious-content-review.json");
    if count==0 {
        if meta["report_digest"]!=Value::Null||report_path.exists(){return Err("Publication blocked: inconsistent zero-findings review".into());}
    } else {
        let report_text=read(&report_path)?;
        let report=json(&report_text)?;
        if !digest(&meta["report_digest"])||meta["report_digest"]!=hash(&report_text)||!matches(&report,&meta,&["run","scan_id","source_digest","candidate_digest","detector_version","status","finding_count"])
            ||report["findings"].as_array().is_none_or(|items|items.len() as u64!=count){return Err("Publication blocked: suspicious-content report differs from scan".into());}
        let ack=json(&read(&directory.join("source-review-ack.json"))?)?;
        if !matches(&ack,&meta,&["run","source_digest","candidate_digest","report_digest","detector_version"])||!nonempty(&ack["operator"])||!nonempty(&ack["reason"])||!nonempty(&ack["acknowledged_at"]){return Err("Publication blocked: exact operator acknowledgment required".into());}
    }
    json(&text)
}
