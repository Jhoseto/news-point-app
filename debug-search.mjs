const s = "Улично осветление";
const lower = s.toLowerCase();
console.log("orig:", s, "len:", s.length);
console.log("lower:", lower, "len:", lower.length);
for (let i = 0; i < s.length; i++) {
  console.log(i, s[i], "->", lower[i], s.charCodeAt(i).toString(16), "->", lower.charCodeAt(i).toString(16));
}
console.log("indexOf 'освещение':", lower.indexOf("освещение"));
console.log("indexOf 'осветление':", lower.indexOf("осветление"));
console.log("indexOf 'свещен':", lower.indexOf("свещен"));
const frag = "освещение";
console.log("frag length:", frag.length);
for (let i = 0; i < frag.length; i++) {
  console.log(i, frag[i], frag.charCodeAt(i).toString(16));
}
