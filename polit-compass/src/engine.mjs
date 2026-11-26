// Deterministic descriptive beta. No network, DOM, storage, packages, or empirical validity claims.
export const DEFAULT_MODEL = {
  "schemaVersion": "1.0.0",
  "id": "bg-compass-descriptive-v2-choice",
  "questionSetVersion": "bg-50-choice-3.0-beta",
  "status": "descriptive_beta_not_psychometrically_validated",
  "sections": [
    "E",
    "P",
    "I",
    "G",
    "D"
  ],
  "allQuestionIds": [
    "E01",
    "E02",
    "E03",
    "E04",
    "E05",
    "E06",
    "E07",
    "E08",
    "E09",
    "E10",
    "P01",
    "P02",
    "P03",
    "P04",
    "P05",
    "P06",
    "P07",
    "P08",
    "P09",
    "P10",
    "I01",
    "I02",
    "I03",
    "I04",
    "I05",
    "I06",
    "I07",
    "I08",
    "I09",
    "I10",
    "G01",
    "G02",
    "G03",
    "G04",
    "G05",
    "G06",
    "G07",
    "G08",
    "G09",
    "G10",
    "D01",
    "D02",
    "D03",
    "D04",
    "D05",
    "D06",
    "D07",
    "D08",
    "D09",
    "D10"
  ],
  "answerValues": [
    -2,
    -1,
    0,
    1,
    2
  ],
  "axes": [
    {
      "id": "redistribution",
      "label": "Данъчно финансиране и преразпределение",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "E01",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "E02",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "E07",
          "sign": 1,
          "weight": 1
        }
      ]
    },
    {
      "id": "state_role",
      "label": "Държавно участие в стопанските решения",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "E04",
          "sign": -1,
          "weight": 1
        },
        {
          "questionId": "E05",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "E06",
          "sign": -1,
          "weight": 1
        },
        {
          "questionId": "E09",
          "sign": 1,
          "weight": 1
        }
      ]
    },
    {
      "id": "personal_autonomy",
      "label": "Личен избор",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "P01",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "P02",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "P03",
          "sign": 1,
          "weight": 1
        }
      ]
    },
    {
      "id": "civil_liberties",
      "label": "Граждански свободи и публичен контрол",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "P05",
          "sign": -1,
          "weight": 1
        },
        {
          "questionId": "P06",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "P08",
          "sign": -1,
          "weight": 1
        }
      ]
    },
    {
      "id": "institutional_checks",
      "label": "Самостоятелни институции и контрол върху мнозинствата",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "I01",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "I02",
          "sign": -1,
          "weight": 1
        },
        {
          "questionId": "I04",
          "sign": 1,
          "weight": 1
        }
      ]
    },
    {
      "id": "eu_integration",
      "label": "Общи решения на Европейския съюз",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "G01",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "G02",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "G03",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "G08",
          "sign": 1,
          "weight": 1
        }
      ]
    },
    {
      "id": "energy_transition",
      "label": "Ограничаване на въглищата и подкрепа за ВЕИ",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "D02",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "D07",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "D09",
          "sign": -1,
          "weight": 1
        }
      ]
    },
    {
      "id": "environment",
      "label": "Правила за опазване на природата и местната среда",
      "minAnswered": 3,
      "bindings": [
        {
          "questionId": "D03",
          "sign": -1,
          "weight": 1
        },
        {
          "questionId": "D05",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "D06",
          "sign": 1,
          "weight": 1
        },
        {
          "questionId": "D10",
          "sign": 1,
          "weight": 1
        }
      ]
    }
  ],
  "profileThresholds": {
    "nearMiddleBelow": 20,
    "strongFrom": 60,
    "maxHeadlineAxes": 3
  },
  "importance": {
    "default": 1,
    "high": 2,
    "maxHighItems": null
  },
  "partyThresholds": {
    "minCoreItems": 25,
    "minCorePerSection": 5,
    "minAnswered": 25,
    "minAnsweredPerSection": 5,
    "minSectionAnswered": 3,
    "minComparableParties": 2,
    "tieWidth": 2
  },
  "sensitivity": {
    "method": "leave_one_answer_out",
    "respectCoverageGates": true,
    "statisticalConfidenceInterval": false
  },
  "policies": {
    "unknownIsNeutral": false,
    "profileUsesImportance": false,
    "partyUsesAxisScores": false,
    "commonCoreFrozen": true,
    "comparisonCoreDefault": "all_50",
    "coreNotChosenFromUserOrPartyResults": true,
    "choiceIdentityPreserved": true,
    "partyUsesPublishedChoiceMatrix": true
  },
  "responseFormat": "policy-choice",
  "allAnswersUsedInReport": true
};

const EPS = 1e-9;
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const lex = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const round = n => n === 0 ? 0 : Math.sign(n) * Math.floor(Math.abs(n) + 0.5 + EPS);
const mean = xs => xs.reduce((a,b)=>a+b,0) / xs.length;
const evidenceFor = ids => ids.map(id => "response:" + id);
const unique = xs => [...new Set(xs)];
function getModel(options) { return options.model || DEFAULT_MODEL; }

export function normalizeResponses(input = {}, options = {}) {
  const model = getModel(options), output = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("responses must be an object");
  for (const id of Object.keys(input)) if (!model.allQuestionIds.includes(id)) throw new RangeError("Unknown question: " + id);
  for (const id of model.allQuestionIds) {
    const item = input[id];
    if (item !== undefined && (!item || typeof item !== "object" || Array.isArray(item))) throw new TypeError("Response must be an object: " + id);
    const value = item?.value ?? null;
    if (value !== null && !model.answerValues.includes(value)) throw new RangeError("Invalid answer: " + id);
    const importance = item?.importance ?? model.importance.default;
    if (![model.importance.default, model.importance.high].includes(importance)) throw new RangeError("Invalid importance: " + id);
    const missingReason = item?.missingReason ?? null;
    if (![null,"unknown","skip"].includes(missingReason)) throw new RangeError("Invalid missingReason: " + id);
    if (value !== null && missingReason !== null) throw new RangeError("Answered question has missingReason: " + id);
    output[id] = {value,importance:value===null ? 1 : importance,missingReason};
  }
  return output;
}

function computeAxis(definition, responses, model, omitId = null) {
  const bindings=definition.bindings.filter(b=>b.questionId!==omitId && responses[b.questionId].value!==null);
  const answered=bindings.length, total=definition.bindings.length;
  const missingIds=definition.bindings.map(b=>b.questionId).filter(id=>id===omitId || responses[id].value===null);
  const result={id:definition.id,label:definition.label,status:"insufficient",score:null,displayScore:null,answered,total,coverage:answered/total,missingIds,evidenceIds:evidenceFor(bindings.map(b=>b.questionId)),positiveIds:[],negativeIds:[],neutralIds:[],pattern:"insufficient",band:"insufficient",meanAbsDeviation:null,sensitivity:{method:"leave_one_answer_out",maxDeviation:null,scenarios:[],statisticalConfidenceInterval:false}};
  for(const b of bindings) result[responses[b.questionId].value*b.sign > 0 ? "positiveIds" : responses[b.questionId].value*b.sign < 0 ? "negativeIds" : "neutralIds"].push(b.questionId);
  if(answered < definition.minAnswered) return result;
  const sumWeights=bindings.reduce((s,b)=>s+b.weight,0);
  if(sumWeights<=0) return result;
  const center=bindings.reduce((s,b)=>s+b.weight*b.sign*responses[b.questionId].value/2,0)/sumWeights;
  result.status="available"; result.score=100*center; result.displayScore=round(result.score);
  result.meanAbsDeviation=bindings.reduce((s,b)=>s+b.weight*Math.abs(b.sign*responses[b.questionId].value/2-center),0)/sumWeights;
  const mixed=result.positiveIds.length>0 && result.negativeIds.length>0, magnitude=Math.abs(result.score);
  result.pattern=result.neutralIds.length===answered ? "neutral_only" : mixed ? (magnitude < model.profileThresholds.nearMiddleBelow ? "mixed_balanced" : "mixed_directional") : "one_sided";
  result.band=magnitude < model.profileThresholds.nearMiddleBelow ? "near_middle" : (magnitude >= model.profileThresholds.strongFrom ? "strong_" : "moderate_")+(result.score>0?"positive":"negative");
  return result;
}

export function evaluateProfile(input = {}, options = {}) {
  const model=getModel(options),responses=normalizeResponses(input,options), axes={}, facts=[],policyFlags={}, sections={};
  for(const def of model.axes) {
    const axis=computeAxis(def,responses,model);
    if(options.computeSensitivity!==false && axis.status==="available") {
      const scenarios=def.bindings.filter(b=>responses[b.questionId].value!==null).map(b=>{
        const after=computeAxis(def,responses,model,b.questionId);
        return after.status==="available" ? {omittedQuestionId:b.questionId,score:after.score,deviation:Math.abs(after.score-axis.score)} : null;
      }).filter(Boolean);
      axis.sensitivity.scenarios=scenarios;
      axis.sensitivity.maxDeviation=scenarios.length ? Math.max(...scenarios.map(s=>s.deviation)) : null;
    }
    axes[def.id]=axis;
    facts.push({id:"axis:"+def.id,type:axis.status==="available"?"axis_summary":"axis_insufficient",axisId:def.id,evidenceIds:axis.evidenceIds,parameters:{score:axis.score,displayScore:axis.displayScore,answered:axis.answered,total:axis.total,band:axis.band,pattern:axis.pattern,meanAbsDeviation:axis.meanAbsDeviation,positiveIds:axis.positiveIds,negativeIds:axis.negativeIds,neutralIds:axis.neutralIds,missingIds:axis.missingIds}});
  }
  for(const id of model.allQuestionIds) {
    const r=responses[id],stance=r.value===null ? "missing" : r.value>0 ? "support" : r.value<0 ? "oppose" : "neutral";
    policyFlags[id]={questionId:id,value:r.value,stance,strength:r.value===null?null:Math.abs(r.value),importance:r.importance,missingReason:r.missingReason,evidenceIds:r.value===null?[]:evidenceFor([id]),axisIds:model.axes.filter(a=>a.bindings.some(b=>b.questionId===id)).map(a=>a.id)};
    if(r.value!==null) facts.push({id:"policy:"+id,type:"policy_position",sectionId:id[0],evidenceIds:evidenceFor([id]),parameters:{questionId:id,value:r.value,stance,strength:Math.abs(r.value),importance:r.importance}});
  }
  for(const sectionId of model.sections) {
    const ids=model.allQuestionIds.filter(id=>id.startsWith(sectionId)),answeredIds=ids.filter(id=>responses[id].value!==null),missingIds=ids.filter(id=>responses[id].value===null);
    sections[sectionId]={id:sectionId,answered:answeredIds.length,total:ids.length,coverage:answeredIds.length/ids.length,answeredIds,missingIds,importantIds:answeredIds.filter(id=>responses[id].importance===2),evidenceIds:evidenceFor(answeredIds),policyIds:ids};
    facts.push({id:"section:"+sectionId,type:"section_coverage",sectionId,evidenceIds:evidenceFor(answeredIds),parameters:{answered:answeredIds.length,total:ids.length,missingIds}});
  }
  const answered=model.allQuestionIds.filter(id=>responses[id].value!==null).length;
  const headlineIds=model.axes.map((a,index)=>({index,...axes[a.id]})).filter(a=>a.status==="available" && Math.abs(a.score)>=model.profileThresholds.nearMiddleBelow).sort((a,b)=>Math.abs(b.score)-Math.abs(a.score)||a.index-b.index).slice(0,model.profileThresholds.maxHeadlineAxes).map(a=>a.id);
  return {modelId:model.id,questionSetVersion:model.questionSetVersion,status:answered===0?"empty":answered===model.allQuestionIds.length?"complete":"partial",coverage:{answered,total:model.allQuestionIds.length,fraction:answered/model.allQuestionIds.length},axes,sections,policyFlags,priorities:model.allQuestionIds.filter(id=>responses[id].value!==null && responses[id].importance===2),headline:{axisIds:headlineIds,evidenceIds:unique(headlineIds.flatMap(id=>axes[id].evidenceIds))},facts,limitations:{notPsychometricallyValidated:true,notVotingProbability:true,coverageIsNotConfidence:true,unansweredQuestionIds:model.allQuestionIds.filter(id=>responses[id].value===null)}};
}

function approvedValue(party, id, model) {
  const p=party.positions?.[id];
  return p && p.status==="approved" && model.answerValues.includes(p.value) && Array.isArray(p.evidenceIds) && p.evidenceIds.length>0 && p.evidenceIds.every(x=>typeof x==="string" && x.length>0) ? p.value : null;
}
function partyScore(party, ids, responses, model, mode) {
  const bySection={};
  for(const s of model.sections) {
    const sectionIds=ids.filter(id=>id.startsWith(s));
    if(!sectionIds.length) continue;
    const denominator=sectionIds.reduce((n,id)=>n+(mode==="priorities"?responses[id].importance:1),0);
    const distance=sectionIds.reduce((n,id)=>n+(mode==="priorities"?responses[id].importance:1)*Math.abs(responses[id].value-approvedValue(party,id,model)),0)/(4*denominator);
    bySection[s]=100*(1-distance);
  }
  return {score:mean(Object.values(bySection)),bySection};
}
function rankScores(entries, tieWidth) {
  const ordered=[...entries].sort((a,b)=>b.score-a.score||lex(a.partyId,b.partyId)),groups=[];
  for(const entry of ordered) {
    let group=groups.at(-1);
    if(!group || group.topScore-entry.score>tieWidth+EPS) {
      group={rank:groups.reduce((n,g)=>n+g.items.length,0)+1,topScore:entry.score,items:[]};groups.push(group);
    }
    group.items.push(entry);
  }
  return groups.flatMap((g,gi)=>g.items.sort((a,b)=>lex(a.partyId,b.partyId)).map(e=>({...e,displayScore:round(e.score),rank:g.rank,tieGroup:gi+1,tied:g.items.length>1,nearTieIds:entries.filter(o=>o.partyId!==e.partyId && Math.abs(o.score-e.score)<=tieWidth+EPS).map(o=>o.partyId).sort(lex)})));
}

export function compareParties(input = {}, snapshot = null, options = {}) {
  const model=getModel(options),responses=normalizeResponses(input,options),mode=options.mode??"base";
  if(!["base","priorities"].includes(mode)) throw new RangeError("mode must be base or priorities");
  const parties=snapshot?.parties??[];
  if(!Array.isArray(parties)) throw new TypeError("snapshot.parties must be an array");
  const seen=new Set();
  for(const p of parties) {if(!p || typeof p.id!=="string" || !p.id || seen.has(p.id))throw new RangeError("Party ids must be unique nonempty strings");seen.add(p.id);}
  const requested=snapshot?.comparisonCoreIds??model.allQuestionIds;
  const coreErrors=[];
  if(!Array.isArray(requested)) coreErrors.push("comparisonCoreIds_not_array");
  const core=Array.isArray(requested)?[...requested]:[];
  if(core.some(id=>!model.allQuestionIds.includes(id)))coreErrors.push("unknown_core_question");
  if(unique(core).length!==core.length)coreErrors.push("duplicate_core_question");
  if(core.length<model.partyThresholds.minCoreItems)coreErrors.push("core_fewer_than_25");
  const coreCounts=Object.fromEntries(model.sections.map(s=>[s,core.filter(id=>typeof id==="string"&&id.startsWith(s)).length]));
  for(const s of model.sections)if(coreCounts[s]<model.partyThresholds.minCorePerSection)coreErrors.push("core_section_below_5:"+s);
  if(snapshot?.questionSetVersion && snapshot.questionSetVersion!==model.questionSetVersion)coreErrors.push("question_set_version_mismatch");
  const coreValid=coreErrors.length===0;
  const effective=coreValid?core.filter(id=>responses[id].value!==null):[];
  const sectionCounts=Object.fromEntries(model.sections.map(s=>[s,effective.filter(id=>id.startsWith(s)).length]));
  const userEligible=effective.length>=model.partyThresholds.minAnswered && model.sections.every(s=>sectionCounts[s]>=model.partyThresholds.minAnsweredPerSection);
  const registry=parties.map(p=>{
    const missingQuestionIds=effective.filter(id=>approvedValue(p,id,model)===null);
    const approvedCoreCount=core.filter(id=>approvedValue(p,id,model)!==null).length;
    return {partyId:p.id,name:p.name??p.id,status:missingQuestionIds.length?"incomplete":"complete_for_answered_core",missingQuestionIds,answeredCoreKnown:effective.length-missingQuestionIds.length,answeredCoreTotal:effective.length,approvedCoreCount,coreTotal:core.length};
  });
  const global={status:!coreValid?"invalid_core":!snapshot||!parties.length?"no_party_data":!userEligible?"insufficient_answers":"insufficient_comparable_parties",ranking:null,answered:effective.length,coreTotal:core.length,coverage:core.length?effective.length/core.length:0,sectionCounts,questionIds:effective,mode};
  const eligible=parties.filter(p=>effective.length>0 && effective.every(id=>approvedValue(p,id,model)!==null));
  if(coreValid&&userEligible&&eligible.length>=model.partyThresholds.minComparableParties) {
    const entries=eligible.map(p=>{
      const {score,bySection}=partyScore(p,effective,responses,model,mode);
      const scenarios=[];
      if(options.computeSensitivity!==false)for(const omit of effective){
        const ids=effective.filter(id=>id!==omit);
        if(ids.length<model.partyThresholds.minAnswered || model.sections.some(s=>ids.filter(id=>id.startsWith(s)).length<model.partyThresholds.minAnsweredPerSection))continue;
        const after=partyScore(p,ids,responses,model,mode).score;
        scenarios.push({omittedQuestionId:omit,score:after,deviation:Math.abs(after-score)});
      }
      return {partyId:p.id,name:p.name??p.id,score,bySection,evidenceIds:unique([...evidenceFor(effective),...effective.flatMap(id=>p.positions[id].evidenceIds)]),sensitivity:{method:"leave_one_answer_out",maxDeviation:scenarios.length?Math.max(...scenarios.map(x=>x.deviation)):null,minScore:Math.min(score,...scenarios.map(x=>x.score)),maxScore:Math.max(score,...scenarios.map(x=>x.score)),scenarios,statisticalConfidenceInterval:false}};
    });
    global.status="available";global.ranking=rankScores(entries,model.partyThresholds.tieWidth);
  }
  const sections={};
  for(const s of model.sections){
    const ids=effective.filter(id=>id.startsWith(s));
    const candidates=parties.filter(p=>ids.length>0&&ids.every(id=>approvedValue(p,id,model)!==null));
    const status=!coreValid?"invalid_core":ids.length<model.partyThresholds.minSectionAnswered?"insufficient_answers":candidates.length<model.partyThresholds.minComparableParties?"insufficient_comparable_parties":"available";
    sections[s]={id:s,status,answered:ids.length,coreTotal:coreCounts[s],questionIds:ids,ranking:status==="available"?rankScores(candidates.map(p=>{const {score}=partyScore(p,ids,responses,model,mode);return{partyId:p.id,name:p.name??p.id,score,evidenceIds:unique([...evidenceFor(ids),...ids.flatMap(id=>p.positions[id].evidenceIds)])};}),model.partyThresholds.tieWidth):null};
  }
  return {snapshotId:snapshot?.id??null,snapshotVersion:snapshot?.version??null,questionSetVersion:model.questionSetVersion,mode,coreIds:core,coreValid,coreErrors,global,sections,registry,limitations:{notVotingProbability:true,coverageIsNotConfidence:true,tieWidth:model.partyThresholds.tieWidth,tieRule:"Groups have at most two raw score points of spread from their leader; nearTieIds also lists cross-group pairs within two points."}};
}

export function evaluateTraditions(profile, traditions = []) {
  if(!Array.isArray(traditions))throw new TypeError("traditions must be an array");
  return traditions.map(t=>{
    if(!t.id||!Array.isArray(t.requirements)||!t.requirements.length)throw new TypeError("Tradition needs id and nonempty requirements");
    const checks=t.requirements.map(r=>{
      if(!has(profile.axes,r.axisId))throw new RangeError("Unknown tradition axis: "+r.axisId);
      if(r.min===undefined&&r.max===undefined)throw new RangeError("Tradition requirement needs min or max");
      if((r.min!==undefined&&(!Number.isFinite(r.min)||r.min < -100||r.min >100))||(r.max!==undefined&&(!Number.isFinite(r.max)||r.max < -100||r.max >100))||(r.min!==undefined&&r.max!==undefined&&r.min>r.max))throw new RangeError("Invalid tradition bounds");
      const a=profile.axes[r.axisId],status=a.status!=="available"?"unknown":(r.min===undefined||a.score>=r.min-EPS)&&(r.max===undefined||a.score<=r.max+EPS)?"match":"difference";
      return {axisId:r.axisId,min:r.min??null,max:r.max??null,score:a.score,status,evidenceIds:a.evidenceIds};
    });
    const matched=checks.filter(c=>c.status==="match").length,unknown=checks.filter(c=>c.status==="unknown").length;
    return {id:t.id,label:t.label??t.id,kind:t.kind??"editorial_tradition_hint",description:t.description??"",status:unknown?"insufficient":matched===checks.length?"matches":matched>0?"partial":"does_not_match",matched,contradicted:checks.filter(c=>c.status==="difference").length,missing:unknown,total:checks.length,requirements:checks,evidenceIds:unique(checks.flatMap(c=>c.evidenceIds)),sourceIds:[...(t.sourceIds??[])],identityPercentage:null,notMembershipClassification:true};
  });
}

export function evaluateCompass({responses={},snapshot=null,traditions=[],options={}} = {}) {
  const profile=evaluateProfile(responses,options);
  return {profile,traditions:evaluateTraditions(profile,traditions),parties:compareParties(responses,snapshot,options)};
}

