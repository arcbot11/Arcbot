"use client";
import { useEffect, useState } from "react";

export function ActiveStatus({text,active,updatedAt}:{text:string;active:boolean;updatedAt?:number}) {
  const [fresh,setFresh]=useState(false);
  useEffect(()=>{
    if(!active){setFresh(false);return;}
    const started=Date.now();
    const check=()=>setFresh(!document.hidden&&Date.now()-(updatedAt??started)<90_000);
    check();const timer=setInterval(check,1000);
    document.addEventListener("visibilitychange",check);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  },[text,active,updatedAt]);
  return <>{fresh?text.replace(/(?:\s*…|\.{1,3})\s*$/,""):text}{fresh&&<span className="active-status-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>}</>;
}
