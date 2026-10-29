import { normalizeSmartQuestion, type SmartQuestion, type SmartTurn } from "@newspoint/content/smart";

export type SmartChoice = SmartQuestion & { public: boolean; parentKey?: string };

/** Replay the reader's visible tray while preserving each suggestion's origin. */
export function smartChoices(roots: SmartQuestion[], turns: (SmartTurn & {nodeKey?:string|null})[], submitting?:string): SmartChoice[] {
  let tray:SmartChoice[]=roots.slice(0,3).map(q=>({...q,public:true}));
  const asked=new Set<string>();
  const reserve:SmartChoice[]=[];
  const key=(q:SmartQuestion)=>normalizeSmartQuestion(q.text);
  for(const turn of turns){
    if(turn.status==="failed")continue;
    const selected=normalizeSmartQuestion(turn.question);
    asked.add(selected);
    const before=tray.length;
    tray=tray.filter(q=>key(q)!==selected);
    if(turn.status!=="completed"||!turn.answer)continue;
    const fresh=turn.answer.followUps.map(q=>({...q,public:Boolean(turn.nodeKey),...(turn.nodeKey?{parentKey:turn.nodeKey}:{})}));
    const candidates=[...fresh,...reserve].filter((q,i,all)=>!asked.has(key(q))&&!tray.some(t=>key(t)===key(q))&&all.findIndex(t=>key(t)===key(q))===i);
    // A custom question can leave all three slots occupied: retain two and
    // introduce one continuation grounded in its answer.
    if(before===tray.length&&tray.length===3&&candidates.length)tray=tray.slice(0,2);
    while(tray.length<3&&candidates.length)tray.push(candidates.shift()!);
    reserve.splice(0,reserve.length,...candidates);
  }
  return tray.filter(q=>key(q)!==normalizeSmartQuestion(submitting??""));
}
