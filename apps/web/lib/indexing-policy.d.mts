type Environment = Record<string, string | undefined>;
export function publicIndexingEnabled(env?: Environment): boolean;
export function publicRobotsMetadata(env?: Environment): { index: boolean; follow: boolean; "max-image-preview": "large" };
export function indexingHeaderRules(env?: Environment): { source: string; headers: { key: string; value: string }[] }[];
