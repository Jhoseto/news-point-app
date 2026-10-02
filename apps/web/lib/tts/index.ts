/**
 * Public re-exports for the TTS module. Keep this list narrow — anything
 * not listed here is considered internal to the package.
 */

export {
  stripHtml,
  preprocessBulgarian,
  numbersToBulgarian,
  expandAbbreviations,
  moneyToSentence,
  timeToSentence,
  speechDurationMs,
  prepareForSpeech,
} from "./text";

export {
  bulgarianVoices,
  qualityScore,
  sortByQuality,
  pickVoice,
  waitForVoices,
  readVoices,
  voiceTier,
  toSnapshot,
  type VoiceQualityTier,
  type VoiceSnapshot,
} from "./voices";

export {
  loadPos,
  savePos,
  clearPos,
  loadPrefs,
  savePrefs,
  DEFAULT_PREFS,
  type TtsPosition,
  type TtsPrefs,
} from "./storage";

export {
  buildUtterances,
  nextUtteranceIndex,
  previousUtteranceIndex,
  blockIndexOf,
  type ArticleUtteranceInput,
  type Utterance,
  type UtteranceKind,
} from "./utterances";

export {
  createPlayback,
  type PlaybackCallbacks,
  type PlaybackController,
  type PlaybackOptions,
  type PlaybackPhase,
  type SpeechSynthesisLike,
} from "./playback";