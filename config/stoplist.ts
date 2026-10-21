/**
 * config/stoplist.ts — Generic breaking news noise tokens and stop words.
 *
 * Implements CUR-01, CUR-04, CUR-15.
 * Used by SimHash headline tokenization and anti-merge guards to prevent
 * generic breaking-news noise ("BREAKING", "LIVE", "UPDATE") from skewing
 * fingerprints and triggering false merges across unrelated breaking events.
 */

export const GENERIC_NOISE_TOKENS_EN: ReadonlySet<string> = new Set([
  'breaking',
  'breaking news',
  'update',
  'updates',
  'latest',
  'live',
  'live update',
  'live updates',
  'watch',
  'video',
  'news',
  'exclusive',
  'report',
  'reports',
  'special report',
  'just in',
  'alert',
  'developing',
  'watch live',
]);

export const GENERIC_NOISE_TOKENS_HI: ReadonlySet<string> = new Set([
  'ताज़ा',
  'ताज़ा खबर',
  'ब्रेकिंग',
  'ब्रेकिंग न्यूज़',
  'लाइव',
  'लाइव अपडेट',
  'अपडेट',
  'खबर',
  'खबरें',
  'विशेष',
  'वीडियो',
  'समाचार',
]);

export const STOP_WORDS_EN: ReadonlySet<string> = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'aren', "aren't", 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between',
  'both', 'but', 'by', 'can', 'cannot', 'could', 'couldn', "couldn't", 'd', 'did', 'didn', "didn't",
  'do', 'does', 'doesn', "doesn't", 'doing', 'don', "don't", 'down', 'during', 'each', 'few',
  'for', 'from', 'further', 'had', 'hadn', "hadn't", 'has', 'hasn', "hasn't", 'have', 'haven',
  "haven't", 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'isn', "isn't", 'it', "it's", 'its', 'itself', 'just', 'll', 'm', 'me',
  'more', 'most', 'mustn', "mustn't", 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off',
  'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 're', 's', 'same',
  'shan', "shan't", 'she', "she's", 'should', 'shouldn', "shouldn't", 'so', 'some', 'such',
  't', 'than', 'that', "that'll", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 've', 'very',
  'was', 'wasn', "wasn't", 'we', 'were', 'weren', "weren't", 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'will', 'with', 'won', "won't", 'would', 'wouldn', "wouldn't",
  'you', "you'd", "you'll", "you're", "you've", 'your', 'yours', 'yourself', 'yourselves',
]);

export const STOP_WORDS_HI: ReadonlySet<string> = new Set([
  'अत', 'अपना', 'अपनी', 'अपने', 'अभी', 'अंदर', 'आदि', 'आप', 'इन्हें', 'इनका', 'इनकी', 'इनके',
  'इन्होंने', 'इन्हीं', 'इन', 'इस', 'इसका', 'इसकी', 'इसके', 'इसने', 'इसी', 'इसे', 'उन',
  'उनका', 'उनकी', 'उनके', 'उन्होंने', 'उन्हीं', 'उन्हें', 'उस', 'उसका', 'उसकी', 'उसके',
  'उसने', 'उसी', 'उसे', 'एक', 'एवं', 'एस', 'ऐसे', 'और', 'कई', 'कर', 'करता', 'करती',
  'करते', 'करना', 'करने', 'करें', 'कहते', 'कहा', 'कही', 'कहे', 'का', 'काफी', 'कि', 'किया',
  'किए', 'किस', 'किसी', 'की', 'कुछ', 'कुल', 'के', 'को', 'कोई', 'कौन', 'क्या', 'गया',
  'गए', 'गई', 'चार', 'चुका', 'चुके', 'चुकी', 'जब', 'तब', 'जहां', 'तहां', 'जा', 'जाता',
  'जाती', 'जाते', 'जाना', 'जाने', 'जारी', 'जी', 'जिसके', 'जिसने', 'जिसे', 'जैसा', 'जैसी',
  'जैसे', 'जो', 'तक', 'तरह', 'तिन', 'तो', 'था', 'थी', 'थे', 'दिया', 'दिए', 'दी',
  'दूसरा', 'दूसरी', 'दूसरे', 'दो', 'द्वारा', 'न', 'नहीं', 'ना', 'नीचे', 'ने', 'पर', 'पहले',
  'पूरा', 'पे', 'फिर', 'बनी', 'बने', 'बना', 'बाद', 'बारे', 'बहुत', 'भी', 'भीतर', 'मगर',
  'माना', 'मिले', 'मुझ', 'मुझे', 'मेरा', 'मेरी', 'मेरे', 'में', 'या', 'यानी', 'ये', 'यह',
  'यहाँ', 'यही', 'रहा', 'रही', 'रहे', 'रहें', 'व', 'वह', 'वहां', 'वहीं', 'वाले', 'वाली',
  'वाला', 'वे', 'वो', 'सा', 'साथ', 'सारे', 'सिर्फ', 'से', 'सो', 'स्वयं', 'हम', 'हमारा',
  'हमारी', 'हमारे', 'हमें', 'हुए', 'हुआ', 'हुई', 'हो', 'होके', 'होकर', 'होना', 'होने',
  'होता', 'होती', 'होते', 'हों', 'ही', 'हैं', 'है',
]);

/**
 * Composite STOPLIST object combining noise tokens and stop words per language.
 */
export const STOPLIST = {
  en: {
    noise: GENERIC_NOISE_TOKENS_EN,
    stopwords: STOP_WORDS_EN,
  },
  hi: {
    noise: GENERIC_NOISE_TOKENS_HI,
    stopwords: STOP_WORDS_HI,
  },
} as const;

export function isNoiseToken(token: string, lang: 'en' | 'hi'): boolean {
  const normalized = token.trim().toLowerCase();
  const noiseSet = lang === 'hi' ? GENERIC_NOISE_TOKENS_HI : GENERIC_NOISE_TOKENS_EN;
  return noiseSet.has(normalized);
}

export function isStopWord(token: string, lang: 'en' | 'hi'): boolean {
  const normalized = token.trim().toLowerCase();
  const stopSet = lang === 'hi' ? STOP_WORDS_HI : STOP_WORDS_EN;
  return stopSet.has(normalized);
}
