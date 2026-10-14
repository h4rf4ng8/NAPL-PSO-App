// ============ USERNAME PROFANITY FILTER ============
// Blocks offensive usernames at registration. To add/remove words, edit the
// lists below. The check normalizes the username first (strips separators,
// numbers, repeated letters, common leetspeak) so simple evasions like
// "f_u_c_k" or "sh1t" are also caught.
//
// BLOCKED_SUBSTRINGS: long, unambiguous words — blocked anywhere in the name.
// BLOCKED_WHOLEWORDS: short words that appear inside innocent words
//   (e.g. "cunt" in "Scunthorpe") — blocked only when they stand alone-ish.
export const BLOCKED_SUBSTRINGS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'pussy', 'whore',
  'porn', 'rapist', 'dildo', 'masturbate', 'orgasm',
  'nigger', 'nigga', 'faggot', 'retard', 'wetback',
  'chink', 'kike', 'tranny', 'nazi', 'hitler', 'rapehub',
];

export const BLOCKED_WHOLEWORDS = [
  'cunt', 'dick', 'cock', 'piss', 'wank', 'twat', 'prick', 'slut',
  'sex', 'rape', 'cum', 'penis', 'vagina', 'boobs', 'horny',
  'nude', 'nudes', 'fag', 'spic', 'dyke', 'coon', 'gook', 'kkk',
];

// Normalize a string to catch obfuscated profanity
export const normalizeForProfanity = (str: string) => {
  let s = str.toLowerCase();
  const leet: Record<string,string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
  s = s.replaceAll(/[013457 8@$!]/g, (c) => leet[c] || c);
  s = s.replaceAll(/[^a-z]/g, '');
  s = s.replaceAll(/(.)\1{2,}/g, '$1');
  return s;
};

// Returns the offending word if the username is not allowed, else null
export const checkUsernameProfanity = (username: string) => {
  const normalized = normalizeForProfanity(username);
  const collapsed = normalized.replaceAll(/(.)\1+/g, '$1');

  // Long unambiguous words: block anywhere
  for (const word of BLOCKED_SUBSTRINGS) {
    if (normalized.includes(word) || collapsed.includes(word)) return word;
  }
  // Short words: block only when surrounded by non-letters or string ends
  // (so "cunt" blocks "x_cunt_x" but not "Scunthorpe")
  for (const word of BLOCKED_WHOLEWORDS) {
    const re = new RegExp(`(^|[^a-z])${word}([^a-z]|$)`);
    // test against the ORIGINAL lowercased name (keeps separators as boundaries)
    if (re.test(username.toLowerCase())) return word;
    // also catch it as the entire normalized string (e.g. "sex" alone)
    if (normalized === word || collapsed === word) return word;
  }
  return null;
};

// ============ EDIT POSITION MODAL ============
// ============ UPLOAD IMAGE MODAL ============
// Compresses uploaded image to ~400px max dimension and stores it as data URL on account
export const compressImage=(file:File,maxDim=400,quality=0.82)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.addEventListener('error',()=>reject(new Error('Could not read file')),{once:true});
  reader.addEventListener('load',()=>{
    if(typeof reader.result!=='string'){reject(new Error('Could not read image'));return;}
    const img=new Image();
    img.addEventListener('error',()=>reject(new Error('Could not load image')),{once:true});
    img.addEventListener('load',()=>{
      try{
        const ratio=Math.min(maxDim/img.width,maxDim/img.height,1);
        const canvas=document.createElement('canvas');
        canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);
        const context=canvas.getContext('2d');
        if(!context)throw new Error('Canvas is unavailable');
        context.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',quality));
      }catch(error){reject(error);}
    },{once:true});
    img.src=reader.result;
  },{once:true});
  reader.readAsDataURL(file);
});

export const numericRowValue=(row:object,key:string):number=>{const value=Reflect.get(row,key);return typeof value==='number'?value:0;};

