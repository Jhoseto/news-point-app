import {expect,it} from "vitest";
import {podcastAudioExtension,podcastAudioMime} from "./podcast-file";
import {planPodcastAudio} from "./byte-range";
it("keeps safe MP3/M4A paths and their correct range/download headers",()=>{
  expect(podcastAudioExtension("podcasts/2026/10/abcd-1234.m4a")).toBe("m4a");
  expect(podcastAudioExtension("podcasts/2026/10/abcd.mp3")).toBe("mp3");
  for(const key of ["podcasts/../secret.m4a","news/2026/10/abcd.m4a","podcasts/2026/10/abcd.wav","podcasts/2026/10/abcd.m4a?x"])expect(podcastAudioExtension(key)).toBeNull();
  const plan=planPodcastAudio(100,"bytes=10-19","fixture-episode.m4a",podcastAudioMime("m4a"));expect(plan.status).toBe(206);
  if(plan.status===206)expect(plan.headers).toMatchObject({"content-type":"audio/mp4","content-range":"bytes 10-19/100","content-length":"10","content-disposition":'attachment; filename="fixture-episode.m4a"'});
});
