import type {SmartBootstrap} from "@newspoint/content/smart";
/** Allowlist reader fields; internal preparation metadata never crosses the API. */
export function publicSmartBootstrap(payload:SmartBootstrap):SmartBootstrap{
  const {status,articleId,version,questions,related,message}=payload;
  return {status,articleId,version,questions,related,...(message?{message}:{})};
}
