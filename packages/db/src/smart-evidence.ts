import type {SmartSource} from "@newspoint/content/smart";

/** Lossless passages with short handles: select evidence instead of copying it. */
export function smartEvidenceRegistry(sources:readonly SmartSource[]){
  const registry=new Map<string,{sourceId:string;quote:string}>();
  const sourceRefs=new Map<string,string>();
  const indexed=sources.map(({passage,checkedAt,...metadata},index)=>{
    const sourceId=`s${index}`;sourceRefs.set(sourceId,metadata.id);
    const passages:{id:string;text:string}[]=[];
    let offset=0;
    while(offset<passage.length){
      let end=Math.min(offset+420,passage.length);
      if(end<passage.length){
        const slice=passage.slice(offset,end);
        const boundary=Math.max(slice.lastIndexOf(". "),slice.lastIndexOf("? "),slice.lastIndexOf("! "),slice.lastIndexOf("\n"));
        const space=slice.lastIndexOf(" ");
        if(boundary>=100)end=offset+boundary+1;
        else if(space>=100)end=offset+space;
      }
      const quote=passage.slice(offset,end);offset=end;
      const id=`e${registry.size}`;
      registry.set(id,{sourceId:metadata.id,quote});passages.push({id,text:quote});
    }
    return {...metadata,id:sourceId,passages};
  });
  return {sources:indexed,sourceChecks:sources.map(({checkedAt},index)=>({id:`s${index}`,checkedAt})),registry,sourceRefs};
}

/** Changing clocks/questions follow stable evidence, preserving prefix caching. */
export function smartPromptInput(input:unknown){
  if(!input||typeof input!=="object"||Array.isArray(input))return JSON.stringify(input);
  const {sources,...rest}=input as Record<string,unknown>;
  if(!Array.isArray(sources))return JSON.stringify(input);
  const checks:unknown[]=[];
  const stable=sources.map((source:unknown)=>{
    if(!source||typeof source!=="object"||Array.isArray(source))return source;
    const {checkedAt,...content}=source as Record<string,unknown>;
    if(checkedAt!==undefined)checks.push({id:content.id,checkedAt});
    return content;
  });
  return JSON.stringify({sources:stable,...rest,...(checks.length?{sourceChecks:checks}:{})});
}
