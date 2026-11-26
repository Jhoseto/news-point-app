export const voteQuestions: ReadonlyArray<{
  id: string;
  topic: string;
  title: string;
  prompt: string;
  proposal: string;
  options: ReadonlyArray<{ value: string; label: string; axis: string; score: number; ballotIndex: number | null; weight: number }>;
  ballot: boolean;
}>;
