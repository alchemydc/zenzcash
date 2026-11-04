import { existsSync } from 'node:fs';
import { accountProfile } from './forum-client.mjs';
import { readJsonStrict,writeJsonAtomic } from './fsio.mjs';

export function cachedProfiles(get,path,observe) {
  const saved=existsSync(path)?readJsonStrict(path):{format:'zforum-profile-cache-1',profiles:{}};
  if(!saved||saved.format!=='zforum-profile-cache-1'||Object.keys(saved).sort().join(',')!=='format,profiles'||!saved.profiles||typeof saved.profiles!=='object'||Array.isArray(saved.profiles))throw new Error(`Invalid profile cache: ${path}`);
  const profiles=new Map(Object.entries(saved.profiles)),pending=new Map();
  for(const [username,profile]of profiles){
    if(!username||!profile||Object.keys(profile).sort().join(',')!=='created_at,status'||!['ok','profile hidden','no public profile'].includes(profile.status)||
      (profile.status==='ok'?typeof profile.created_at!=='string'||!Number.isFinite(Date.parse(profile.created_at)):profile.created_at!==null))throw new Error(`Invalid cached profile for ${username}: ${path}`);
  }
  return async username=>{
    if(profiles.has(username)){observe({hit:true});return structuredClone(profiles.get(username));}
    if(pending.has(username)){observe({hit:true});return structuredClone(await pending.get(username));}
    observe({hit:false});
    const request=accountProfile(get,username).then(profile=>{
      writeJsonAtomic(path,{format:'zforum-profile-cache-1',profiles:Object.fromEntries([...profiles,[username,profile]])});
      profiles.set(username,profile);
      return profile;
    });
    pending.set(username,request);
    try{return structuredClone(await request);}finally{pending.delete(username);}
  };
}
