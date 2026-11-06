// Words Reef Rush won't take as an answer (slurs and swearing), so the typo-forgiving matcher
// can never turn one into a near-miss of a real answer ("Niger" is one letter from a slur).
// Written in ROT13 so the file doesn't spell them out; checked word by word, so a real
// answer that merely contains one ("Scunthorpe", "Shih tzu|shitzu") isn't caught.
const ROT = "avttre avttn avttref avttnf avtthu shpx shpxre shpxvat shpxva zbgureshpxre fuvg fuvggl ohyyfuvg ovgpu ovgpurf phag juber fyhg snt snttbg ergneq ergneqrq qvpxurnq chffl pbpx gjng nffubyr nefrubyr onfgneq fcvp puvax xvxr jrgonpx tbbx genaal qlxr pbba phz cravf intvan obbo obbof cbea encr encvfg anmv uvgyre";
const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const BAD = new Set(ROT.split(" ").map(rot13));

// True if any word of the text is on the list (also with letters run together: "f u c k").
export function rude(text) {
  const plain = String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[0@]/g, "o").replace(/[1!]/g, "i").replace(/3/g, "e").replace(/\$/g, "s");
  const words = plain.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BAD.has(w))) return true;
  return BAD.has(words.join(""));
}
