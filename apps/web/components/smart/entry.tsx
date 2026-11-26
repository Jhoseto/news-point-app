"use client";
import {useEffect,useState} from "react";
import {SmartReader} from "./reader";

/** Outside cached article HTML: OFF never leaves a placeholder or activates reader effects. */
export function SmartEntry(props:{articleId:string;measurementId?:string|undefined}){
  const [enabled,setEnabled]=useState(false);
  useEffect(()=>{
    let disposed=false,busy=false;let controller:AbortController|undefined;
    const check=async()=>{
      if(busy||document.visibilityState==="hidden")return;
      busy=true;controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),5000);
      try{
        const response=await fetch("/api/smart/availability/",{cache:"no-store",signal:controller.signal});
        if(response.ok){
          const result=await response.json();
          if(!disposed&&typeof result.enabled==="boolean")setEnabled(result.enabled);
        }
      }catch{/* Keep the last confirmed flag while offline. The API checks it on every request. */}
      finally{clearTimeout(timer);busy=false;}
    };
    void check();const timer=setInterval(()=>void check(),15000);
    const focus=()=>void check();window.addEventListener("focus",focus);document.addEventListener("visibilitychange",focus);
    return()=>{disposed=true;controller?.abort();clearInterval(timer);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",focus);};
  },[props.articleId]);
  return enabled?<SmartReader key={props.articleId} {...props}/>:null;
}
