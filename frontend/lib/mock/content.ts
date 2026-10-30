// Demo card decks, quizzes and tutor replies. In the real app these come from Sarvam
// (sarvam-105b) once per grade+topic+language and are cached in the DB.

import type { Language, QuizQuestion, Topic, TopicCard, TutorReply } from "../types";

interface DeckContent {
  title: string;
  cards: Omit<TopicCard, "id">[];
  quiz: Omit<QuizQuestion, "id">[];
}

// ---------- Grade 4: Equivalent fractions (g4-t13) ----------

const EQUIVALENT: Record<Language, DeckContent> = {
  en: {
    title: "Equivalent fractions",
    cards: [
      {
        title: "Same amount, different names",
        body: "1/2 and 2/4 cover the same part of a whole. Fractions that show the same amount are called equivalent fractions.",
      },
      {
        title: "Fold and see",
        body: "Fold a paper into 2 equal parts and shade 1 part: 1/2. Fold it once more: now there are 4 equal parts and 2 are shaded: 2/4. The shaded part did not change!",
      },
      {
        title: "Multiply top and bottom",
        body: "Multiply the numerator and the denominator by the same number to get an equivalent fraction.",
        example: "1/2 = (1×3)/(2×3) = 3/6",
      },
      {
        title: "Check with a roti",
        body: "A roti is cut into 4 pieces and you eat 2. Another roti is cut into 8 pieces and you eat 4. You ate the same amount both times.",
        example: "2/4 = 4/8",
      },
    ],
    quiz: [
      { question: "Which fraction is equal to 1/2?", options: ["1/3", "2/4", "2/3", "1/4"], answerIndex: 1, explanation: "2/4: two of four equal parts is half." },
      { question: "1/3 = ?/6", options: ["1", "3", "2", "6"], answerIndex: 2, explanation: "Multiply top and bottom by 2: 2/6." },
      { question: "Which pair is equivalent?", options: ["1/2 and 1/4", "3/4 and 3/8", "1/5 and 2/5", "2/3 and 4/6"], answerIndex: 3, explanation: "2×2 = 4 and 3×2 = 6." },
      { question: "A cake is cut into 8 equal parts. Rahim eats 4. What part did he eat?", options: ["1/2", "1/4", "1/8", "4/4"], answerIndex: 0, explanation: "4/8 is the same as 1/2." },
      { question: "To get an equivalent fraction, multiply the numerator and denominator by…", options: ["different numbers", "the same number", "zero", "only the denominator"], answerIndex: 1 },
    ],
  },
  kn: {
    title: "ಸಮಾನ ಭಿನ್ನರಾಶಿಗಳು",
    cards: [
      {
        title: "ಒಂದೇ ಭಾಗ, ಬೇರೆ ಹೆಸರು",
        body: "1/2 ಮತ್ತು 2/4 ಒಂದೇ ಪ್ರಮಾಣದ ಭಾಗವನ್ನು ತೋರಿಸುತ್ತವೆ. ಒಂದೇ ಪ್ರಮಾಣವನ್ನು ತೋರಿಸುವ ಭಿನ್ನರಾಶಿಗಳನ್ನು ಸಮಾನ ಭಿನ್ನರಾಶಿಗಳು ಎನ್ನುತ್ತೇವೆ.",
      },
      {
        title: "ಮಡಚಿ ನೋಡು",
        body: "ಒಂದು ಕಾಗದವನ್ನು 2 ಸಮ ಭಾಗಗಳಾಗಿ ಮಡಚಿ 1 ಭಾಗಕ್ಕೆ ಬಣ್ಣ ಹಚ್ಚು: 1/2. ಇನ್ನೊಮ್ಮೆ ಮಡಚು: ಈಗ 4 ಸಮ ಭಾಗಗಳು, 2 ಭಾಗಗಳಿಗೆ ಬಣ್ಣವಿದೆ: 2/4. ಬಣ್ಣದ ಭಾಗ ಬದಲಾಗಲಿಲ್ಲ!",
      },
      {
        title: "ಅಂಶ ಮತ್ತು ಛೇದವನ್ನು ಗುಣಿಸು",
        body: "ಅಂಶ ಮತ್ತು ಛೇದ ಎರಡನ್ನೂ ಒಂದೇ ಸಂಖ್ಯೆಯಿಂದ ಗುಣಿಸಿದರೆ ಸಮಾನ ಭಿನ್ನರಾಶಿ ಸಿಗುತ್ತದೆ.",
        example: "1/2 = (1×3)/(2×3) = 3/6",
      },
      {
        title: "ರೊಟ್ಟಿಯಿಂದ ಪರೀಕ್ಷಿಸು",
        body: "4 ತುಂಡು ಮಾಡಿದ ರೊಟ್ಟಿಯಲ್ಲಿ 2 ತುಂಡು ತಿಂದೆ. 8 ತುಂಡು ಮಾಡಿದ ರೊಟ್ಟಿಯಲ್ಲಿ 4 ತುಂಡು ತಿಂದೆ. ಎರಡೂ ಸಲ ಒಂದೇ ಪ್ರಮಾಣ.",
        example: "2/4 = 4/8",
      },
    ],
    quiz: [
      { question: "1/2 ಕ್ಕೆ ಸಮಾನವಾದ ಭಿನ್ನರಾಶಿ ಯಾವುದು?", options: ["1/3", "2/4", "2/3", "1/4"], answerIndex: 1 },
      { question: "1/3 = ?/6", options: ["1", "3", "2", "6"], answerIndex: 2 },
      { question: "ಯಾವ ಜೋಡಿ ಸಮಾನ ಭಿನ್ನರಾಶಿಗಳು?", options: ["1/2 ಮತ್ತು 1/4", "3/4 ಮತ್ತು 3/8", "1/5 ಮತ್ತು 2/5", "2/3 ಮತ್ತು 4/6"], answerIndex: 3 },
      { question: "ಒಂದು ಕೇಕನ್ನು 8 ಸಮ ಭಾಗ ಮಾಡಲಾಗಿದೆ. ರಹೀಮ್ 4 ಭಾಗ ತಿಂದನು. ಅದು ಎಷ್ಟು ಭಾಗ?", options: ["1/2", "1/4", "1/8", "4/4"], answerIndex: 0 },
      { question: "ಸಮಾನ ಭಿನ್ನರಾಶಿ ಪಡೆಯಲು ಅಂಶ ಮತ್ತು ಛೇದವನ್ನು … ಗುಣಿಸಬೇಕು.", options: ["ಬೇರೆ ಬೇರೆ ಸಂಖ್ಯೆಗಳಿಂದ", "ಒಂದೇ ಸಂಖ್ಯೆಯಿಂದ", "ಸೊನ್ನೆಯಿಂದ", "ಛೇದವನ್ನು ಮಾತ್ರ"], answerIndex: 1 },
    ],
  },
  hi: {
    title: "तुल्य भिन्न",
    cards: [
      {
        title: "एक ही हिस्सा, अलग नाम",
        body: "1/2 और 2/4 एक ही हिस्सा दिखाते हैं। जो भिन्न एक ही मात्रा दिखाते हैं, उन्हें तुल्य भिन्न कहते हैं।",
      },
      {
        title: "मोड़ो और देखो",
        body: "एक कागज़ को 2 बराबर भागों में मोड़ो और 1 भाग में रंग भरो: 1/2। एक बार और मोड़ो: अब 4 बराबर भाग हैं और 2 भागों में रंग है: 2/4। रंगा हुआ हिस्सा नहीं बदला!",
      },
      {
        title: "अंश और हर को गुणा करो",
        body: "अंश और हर दोनों को एक ही संख्या से गुणा करने पर तुल्य भिन्न मिलता है।",
        example: "1/2 = (1×3)/(2×3) = 3/6",
      },
      {
        title: "रोटी से जाँचो",
        body: "4 टुकड़ों वाली रोटी में से 2 टुकड़े खाए। 8 टुकड़ों वाली रोटी में से 4 टुकड़े खाए। दोनों बार बराबर खाया।",
        example: "2/4 = 4/8",
      },
    ],
    quiz: [
      { question: "1/2 के बराबर कौन-सा भिन्न है?", options: ["1/3", "2/4", "2/3", "1/4"], answerIndex: 1 },
      { question: "1/3 = ?/6", options: ["1", "3", "2", "6"], answerIndex: 2 },
      { question: "कौन-सी जोड़ी तुल्य भिन्न है?", options: ["1/2 और 1/4", "3/4 और 3/8", "1/5 और 2/5", "2/3 और 4/6"], answerIndex: 3 },
      { question: "एक केक के 8 बराबर टुकड़े हैं। रहीम ने 4 खाए। उसने कितना हिस्सा खाया?", options: ["1/2", "1/4", "1/8", "4/4"], answerIndex: 0 },
      { question: "तुल्य भिन्न पाने के लिए अंश और हर को … से गुणा करते हैं।", options: ["अलग-अलग संख्याओं", "एक ही संख्या", "शून्य", "सिर्फ़ हर"], answerIndex: 1 },
    ],
  },
};

// ---------- Grade 4: Decimals 0.1 to 0.9 (g4-t14) ----------

const DECIMALS: Record<Language, DeckContent> = {
  en: {
    title: "Decimals 0.1 to 0.9",
    cards: [
      { title: "Tenths", body: "When one whole is divided into 10 equal parts, each part is one tenth. We write it as 1/10 or 0.1." },
      { title: "Reading decimals", body: "0.1 is read as \"zero point one\". 0.3 means 3 tenths. The dot is called the decimal point." },
      { title: "Fraction to decimal", body: "Any number of tenths can be written as a decimal.", example: "2/10 = 0.2   5/10 = 0.5   9/10 = 0.9" },
      { title: "In real life", body: "Cut a 1-metre ribbon into 10 equal pieces. Each piece is 0.1 metre. 7 pieces make 0.7 metre." },
    ],
    quiz: [
      { question: "Write 3/10 as a decimal.", options: ["0.3", "3.0", "0.03", "30"], answerIndex: 0 },
      { question: "How do we read 0.6?", options: ["six", "zero point six", "sixty", "point sixty"], answerIndex: 1 },
      { question: "Which is the biggest?", options: ["0.4", "0.2", "0.7", "0.1"], answerIndex: 2 },
      { question: "One whole has how many tenths?", options: ["1", "5", "100", "10"], answerIndex: 3 },
      { question: "0.5 is equal to…", options: ["1/5", "5/10", "5/100", "1/10"], answerIndex: 1 },
    ],
  },
  kn: {
    title: "ದಶಮಾಂಶಗಳು: 0.1 ರಿಂದ 0.9",
    cards: [
      { title: "ಹತ್ತನೇ ಒಂದು ಭಾಗ", body: "ಒಂದು ಪೂರ್ಣವನ್ನು 10 ಸಮ ಭಾಗಗಳಾಗಿ ಮಾಡಿದಾಗ ಪ್ರತಿ ಭಾಗವು ಹತ್ತನೇ ಒಂದು ಭಾಗ. ಅದನ್ನು 1/10 ಅಥವಾ 0.1 ಎಂದು ಬರೆಯುತ್ತೇವೆ." },
      { title: "ದಶಮಾಂಶ ಓದುವುದು", body: "0.1 ಅನ್ನು \"ಸೊನ್ನೆ ದಶಮಾಂಶ ಒಂದು\" ಎಂದು ಓದುತ್ತೇವೆ. 0.3 ಎಂದರೆ 3 ಹತ್ತನೇ ಭಾಗಗಳು. ಚುಕ್ಕೆಯನ್ನು ದಶಮಾಂಶ ಬಿಂದು ಎನ್ನುತ್ತೇವೆ." },
      { title: "ಭಿನ್ನರಾಶಿಯಿಂದ ದಶಮಾಂಶ", body: "ಹತ್ತನೇ ಭಾಗಗಳನ್ನು ದಶಮಾಂಶವಾಗಿ ಬರೆಯಬಹುದು.", example: "2/10 = 0.2   5/10 = 0.5   9/10 = 0.9" },
      { title: "ನಿಜ ಜೀವನದಲ್ಲಿ", body: "1 ಮೀಟರ್ ರಿಬ್ಬನ್ ಅನ್ನು 10 ಸಮ ತುಂಡುಗಳಾಗಿ ಕತ್ತರಿಸಿದರೆ ಪ್ರತಿ ತುಂಡು 0.1 ಮೀಟರ್. 7 ತುಂಡುಗಳು 0.7 ಮೀಟರ್." },
    ],
    quiz: [
      { question: "3/10 ಅನ್ನು ದಶಮಾಂಶದಲ್ಲಿ ಬರೆ.", options: ["0.3", "3.0", "0.03", "30"], answerIndex: 0 },
      { question: "0.6 ಅನ್ನು ಹೇಗೆ ಓದುತ್ತೇವೆ?", options: ["ಆರು", "ಸೊನ್ನೆ ದಶಮಾಂಶ ಆರು", "ಅರವತ್ತು", "ದಶಮಾಂಶ ಅರವತ್ತು"], answerIndex: 1 },
      { question: "ಯಾವುದು ದೊಡ್ಡದು?", options: ["0.4", "0.2", "0.7", "0.1"], answerIndex: 2 },
      { question: "ಒಂದು ಪೂರ್ಣದಲ್ಲಿ ಎಷ್ಟು ಹತ್ತನೇ ಭಾಗಗಳಿವೆ?", options: ["1", "5", "100", "10"], answerIndex: 3 },
      { question: "0.5 ಇದಕ್ಕೆ ಸಮ…", options: ["1/5", "5/10", "5/100", "1/10"], answerIndex: 1 },
    ],
  },
  hi: {
    title: "दशमलव: 0.1 से 0.9",
    cards: [
      { title: "दसवाँ भाग", body: "जब एक पूरे को 10 बराबर भागों में बाँटते हैं, तो हर भाग दसवाँ भाग होता है। इसे 1/10 या 0.1 लिखते हैं।" },
      { title: "दशमलव पढ़ना", body: "0.1 को \"शून्य दशमलव एक\" पढ़ते हैं। 0.3 का अर्थ है 3 दसवें भाग। बिंदु को दशमलव बिंदु कहते हैं।" },
      { title: "भिन्न से दशमलव", body: "दसवें भागों को दशमलव में लिख सकते हैं।", example: "2/10 = 0.2   5/10 = 0.5   9/10 = 0.9" },
      { title: "रोज़ की ज़िंदगी में", body: "1 मीटर रिबन को 10 बराबर टुकड़ों में काटो। हर टुकड़ा 0.1 मीटर है। 7 टुकड़े 0.7 मीटर हैं।" },
    ],
    quiz: [
      { question: "3/10 को दशमलव में लिखो।", options: ["0.3", "3.0", "0.03", "30"], answerIndex: 0 },
      { question: "0.6 को कैसे पढ़ते हैं?", options: ["छह", "शून्य दशमलव छह", "साठ", "दशमलव साठ"], answerIndex: 1 },
      { question: "सबसे बड़ा कौन-सा है?", options: ["0.4", "0.2", "0.7", "0.1"], answerIndex: 2 },
      { question: "एक पूरे में कितने दसवें भाग होते हैं?", options: ["1", "5", "100", "10"], answerIndex: 3 },
      { question: "0.5 बराबर है…", options: ["1/5", "5/10", "5/100", "1/10"], answerIndex: 1 },
    ],
  },
};

const WRITTEN: Record<string, Record<Language, DeckContent>> = {
  "g4-t13": EQUIVALENT,
  "g4-t14": DECIMALS,
};

// ---------- Generic deck for every other topic (stands in for a Sarvam generation) ----------

const TEMPLATE: Record<Language, (t: Topic) => DeckContent> = {
  en: (t) => ({
    title: t.title,
    cards: [
      { title: `What is "${t.title}"?`, body: `Today we learnt ${t.title.toLowerCase()} from the chapter "${t.chapter}". Read your textbook page again with someone at home.` },
      { title: "Look at an example", body: `Your teacher solved an example on the board. Write it in your notebook and say each step aloud.` },
      { title: "Try it yourself", body: "Make one question of your own like the example. Solve it, then check it with a friend." },
      { title: "Remember", body: "Go slowly. If you get stuck, ask Vidya or your teacher. Mistakes help us learn." },
    ],
    quiz: genericQuiz(t, "en"),
  }),
  kn: (t) => ({
    title: t.title,
    cards: [
      { title: `"${t.title}" ಎಂದರೇನು?`, body: `ಇಂದು ನಾವು "${t.chapter}" ಅಧ್ಯಾಯದಿಂದ ${t.title} ಕಲಿತೆವು. ಮನೆಯಲ್ಲಿ ಯಾರ ಜೊತೆಗಾದರೂ ಪಠ್ಯಪುಸ್ತಕದ ಪುಟವನ್ನು ಮತ್ತೆ ಓದು.` },
      { title: "ಒಂದು ಉದಾಹರಣೆ ನೋಡು", body: "ಶಿಕ್ಷಕರು ಕಪ್ಪು ಹಲಗೆಯ ಮೇಲೆ ಒಂದು ಉದಾಹರಣೆ ಬಿಡಿಸಿದರು. ಅದನ್ನು ನೋಟ್‌ಬುಕ್‌ನಲ್ಲಿ ಬರೆದು ಪ್ರತಿ ಹಂತವನ್ನು ಜೋರಾಗಿ ಹೇಳು." },
      { title: "ನೀನೇ ಪ್ರಯತ್ನಿಸು", body: "ಅದೇ ರೀತಿಯ ಒಂದು ಪ್ರಶ್ನೆ ಮಾಡು. ಬಿಡಿಸಿ, ಸ್ನೇಹಿತನ ಜೊತೆ ಪರಿಶೀಲಿಸು." },
      { title: "ನೆನಪಿಡು", body: "ನಿಧಾನವಾಗಿ ಮಾಡು. ಅರ್ಥವಾಗದಿದ್ದರೆ ವಿದ್ಯಾ ಅಥವಾ ಶಿಕ್ಷಕರನ್ನು ಕೇಳು." },
    ],
    quiz: genericQuiz(t, "kn"),
  }),
  hi: (t) => ({
    title: t.title,
    cards: [
      { title: `"${t.title}" क्या है?`, body: `आज हमने "${t.chapter}" अध्याय से ${t.title} सीखा। घर पर किसी के साथ पाठ्यपुस्तक का पन्ना फिर से पढ़ो।` },
      { title: "एक उदाहरण देखो", body: "शिक्षक ने बोर्ड पर एक उदाहरण हल किया। उसे कॉपी में लिखो और हर कदम ज़ोर से बोलो।" },
      { title: "ख़ुद करके देखो", body: "उसी तरह का एक सवाल ख़ुद बनाओ। हल करो और दोस्त के साथ जाँचो।" },
      { title: "याद रखो", body: "धीरे-धीरे करो। समझ न आए तो विद्या या शिक्षक से पूछो।" },
    ],
    quiz: genericQuiz(t, "hi"),
  }),
};

function genericQuiz(t: Topic, lang: Language): Omit<QuizQuestion, "id">[] {
  // Simple arithmetic questions tuned by grade so the demo quiz is still answerable.
  const n = t.grade * 10 + t.order;
  const q = {
    en: ["What is", "Which number is the biggest?", "Which is correct?", "How many tens are in", "What comes next: "],
    kn: ["ಇದರ ಉತ್ತರ ಏನು:", "ಯಾವ ಸಂಖ್ಯೆ ದೊಡ್ಡದು?", "ಯಾವುದು ಸರಿ?", "ಇದರಲ್ಲಿ ಎಷ್ಟು ಹತ್ತುಗಳಿವೆ:", "ಮುಂದೆ ಏನು ಬರುತ್ತದೆ: "],
    hi: ["इसका उत्तर क्या है:", "सबसे बड़ी संख्या कौन-सी है?", "कौन-सा सही है?", "इसमें कितनी दहाइयाँ हैं:", "आगे क्या आएगा: "],
  }[lang];
  return [
    { question: `${q[0]} ${n} + ${t.grade}?`, options: [`${n + t.grade}`, `${n}`, `${n + t.grade + 1}`, `${n - t.grade}`], answerIndex: 0 },
    { question: q[1], options: [`${n * 3}`, `${n * 3 + 9}`, `${n * 2}`, `${n}`], answerIndex: 1 },
    { question: q[2], options: [`${t.grade} × 2 = ${t.grade + 2}`, `${t.grade} × 3 = ${t.grade * 3 + 1}`, `${t.grade} × 4 = ${t.grade * 4}`, `${t.grade} × 5 = ${t.grade * 4}`], answerIndex: 2 },
    { question: `${q[3]} ${n * 10}?`, options: [`${n + 1}`, `${n - 1}`, `${n * 10}`, `${n}`], answerIndex: 3 },
    { question: `${q[4]}${t.grade}, ${t.grade * 2}, ${t.grade * 3}, ?`, options: [`${t.grade * 5}`, `${t.grade * 4}`, `${t.grade * 3 + 1}`, `${t.grade * 6}`], answerIndex: 1 },
  ];
}

export function deckContent(topic: Topic, lang: Language): DeckContent {
  return WRITTEN[topic.id]?.[lang] ?? TEMPLATE[lang](topic);
}

// ---------- Vidya tutor (demo replies; real app uses sarvam-105b-conversations) ----------

const REPLIES: { match: RegExp; reply: Record<Language, TutorReply> }[] = [
  {
    match: /equivalent|same|ಸಮಾನ|तुल्य|2\/4|1\/2/i,
    reply: {
      en: {
        text: "Equivalent fractions show the same amount. Fold a paper in half: that's 1/2. Fold again: 4 parts, 2 shaded, that's 2/4. Same shaded part! Can you find a fraction equal to 1/3?",
        suggestions: ["Is 2/6 equal to 1/3?", "Why multiply top and bottom?", "Give me a quiz question"],
      },
      kn: {
        text: "ಸಮಾನ ಭಿನ್ನರಾಶಿಗಳು ಒಂದೇ ಪ್ರಮಾಣವನ್ನು ತೋರಿಸುತ್ತವೆ. ಕಾಗದವನ್ನು ಅರ್ಧ ಮಡಚು: 1/2. ಮತ್ತೆ ಮಡಚು: 4 ಭಾಗ, 2 ಬಣ್ಣದ ಭಾಗ: 2/4. ಒಂದೇ ಭಾಗ! 1/3 ಕ್ಕೆ ಸಮಾನ ಭಿನ್ನರಾಶಿ ಹೇಳಬಲ್ಲೆಯಾ?",
        suggestions: ["2/6 ಮತ್ತು 1/3 ಸಮವೇ?", "ಒಂದು ಪ್ರಶ್ನೆ ಕೊಡು"],
      },
      hi: {
        text: "तुल्य भिन्न एक ही मात्रा दिखाते हैं। कागज़ को आधा मोड़ो: 1/2। फिर मोड़ो: 4 भाग, 2 रंगे हुए: 2/4। वही हिस्सा! क्या तुम 1/3 के बराबर भिन्न बता सकते हो?",
        suggestions: ["क्या 2/6 = 1/3?", "एक सवाल दो"],
      },
    },
  },
  {
    match: /2\/6|yes|ಹೌದು|हाँ/i,
    reply: {
      en: { text: "Yes! 1×2 = 2 and 3×2 = 6, so 1/3 = 2/6. You multiplied the top and bottom by the same number. Well done!", suggestions: ["Give me a harder one", "What is a decimal?"] },
      kn: { text: "ಹೌದು! 1×2 = 2 ಮತ್ತು 3×2 = 6, ಆದ್ದರಿಂದ 1/3 = 2/6. ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ!", suggestions: ["ಇನ್ನೊಂದು ಕಠಿಣ ಪ್ರಶ್ನೆ"] },
      hi: { text: "हाँ! 1×2 = 2 और 3×2 = 6, इसलिए 1/3 = 2/6। बहुत बढ़िया!", suggestions: ["और कठिन सवाल दो"] },
    },
  },
  {
    match: /decimal|0\.\d|ದಶಮಾಂಶ|दशमलव|point/i,
    reply: {
      en: { text: "A decimal is another way to write tenths. Break a chocolate bar into 10 equal pieces. One piece is 0.1 of the bar. 4 pieces are 0.4. Which is more: 0.4 or 0.7?", suggestions: ["0.7 is more", "How do I read 0.5?"] },
      kn: { text: "ದಶಮಾಂಶ ಎಂದರೆ ಹತ್ತನೇ ಭಾಗಗಳನ್ನು ಬರೆಯುವ ಇನ್ನೊಂದು ವಿಧಾನ. ಚಾಕೊಲೇಟ್ ಅನ್ನು 10 ಸಮ ತುಂಡು ಮಾಡು. ಒಂದು ತುಂಡು 0.1. 4 ತುಂಡು 0.4. ಯಾವುದು ಹೆಚ್ಚು: 0.4 ಅಥವಾ 0.7?", suggestions: ["0.7 ಹೆಚ್ಚು"] },
      hi: { text: "दशमलव दसवें भाग लिखने का दूसरा तरीका है। चॉकलेट के 10 बराबर टुकड़े करो। एक टुकड़ा 0.1 है। 4 टुकड़े 0.4 हैं। कौन ज़्यादा है: 0.4 या 0.7?", suggestions: ["0.7 ज़्यादा है"] },
    },
  },
  {
    match: /numerator|denominator|ಅಂಶ|ಛೇದ|अंश|हर\b/i,
    reply: {
      en: { text: "In 3/4, the bottom number 4 (denominator) tells how many equal parts the whole is cut into. The top number 3 (numerator) tells how many parts we take.", suggestions: ["Show me with a roti", "What are equivalent fractions?"] },
      kn: { text: "3/4 ರಲ್ಲಿ ಕೆಳಗಿನ 4 (ಛೇದ) ಪೂರ್ಣವನ್ನು ಎಷ್ಟು ಸಮ ಭಾಗ ಮಾಡಿದೆ ಎಂದು ಹೇಳುತ್ತದೆ. ಮೇಲಿನ 3 (ಅಂಶ) ಎಷ್ಟು ಭಾಗ ತೆಗೆದುಕೊಂಡೆವು ಎಂದು ಹೇಳುತ್ತದೆ.", suggestions: ["ಸಮಾನ ಭಿನ್ನರಾಶಿ ಎಂದರೇನು?"] },
      hi: { text: "3/4 में नीचे वाला 4 (हर) बताता है कि पूरे को कितने बराबर भागों में बाँटा। ऊपर वाला 3 (अंश) बताता है कि कितने भाग लिए।", suggestions: ["तुल्य भिन्न क्या है?"] },
    },
  },
  {
    match: /table|multipl|×|ಗುಣಾಕಾರ|ಮಗ್ಗಿ|गुणा|पहाड़ा/i,
    reply: {
      en: { text: "Multiplication is quick adding. 6 × 3 means 6 + 6 + 6 = 18. Try saying the 6 table with me: 6, 12, 18, 24… what comes next?", suggestions: ["30", "Help with the 7 table"] },
      kn: { text: "ಗುಣಾಕಾರ ಎಂದರೆ ಬೇಗ ಕೂಡುವುದು. 6 × 3 ಎಂದರೆ 6 + 6 + 6 = 18. ನನ್ನ ಜೊತೆ 6 ರ ಮಗ್ಗಿ ಹೇಳು: 6, 12, 18, 24… ಮುಂದೆ?", suggestions: ["30"] },
      hi: { text: "गुणा मतलब जल्दी जोड़ना। 6 × 3 यानी 6 + 6 + 6 = 18। मेरे साथ 6 का पहाड़ा बोलो: 6, 12, 18, 24… आगे?", suggestions: ["30"] },
    },
  },
  {
    match: /quiz|question|ಪ್ರಶ್ನೆ|सवाल/i,
    reply: {
      en: { text: "Here's one: a pizza has 6 equal slices and you eat 3. What fraction did you eat? Is it the same as 1/2?", suggestions: ["3/6, yes it's 1/2", "I don't know"] },
      kn: { text: "ಪ್ರಶ್ನೆ: ಒಂದು ಪಿಜ್ಜಾದಲ್ಲಿ 6 ಸಮ ತುಂಡುಗಳಿವೆ, ನೀನು 3 ತಿಂದೆ. ಎಷ್ಟು ಭಾಗ ತಿಂದೆ? ಅದು 1/2 ಕ್ಕೆ ಸಮವೇ?", suggestions: ["3/6, ಹೌದು"] },
      hi: { text: "सवाल: पिज़्ज़ा के 6 बराबर टुकड़े हैं, तुमने 3 खाए। कितना हिस्सा खाया? क्या यह 1/2 के बराबर है?", suggestions: ["3/6, हाँ"] },
    },
  },
];

const FALLBACK: Record<Language, TutorReply> = {
  en: { text: "Good question! I can help with what your teacher taught this week. Ask me about fractions, decimals or tables, or tap a suggestion.", suggestions: ["What are equivalent fractions?", "What is a decimal?", "Give me a quiz question"] },
  kn: { text: "ಒಳ್ಳೆಯ ಪ್ರಶ್ನೆ! ಈ ವಾರ ಶಿಕ್ಷಕರು ಕಲಿಸಿದ ವಿಷಯದಲ್ಲಿ ನಾನು ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ಭಿನ್ನರಾಶಿ, ದಶಮಾಂಶ ಅಥವಾ ಮಗ್ಗಿ ಬಗ್ಗೆ ಕೇಳು.", suggestions: ["ಸಮಾನ ಭಿನ್ನರಾಶಿ ಎಂದರೇನು?", "ದಶಮಾಂಶ ಎಂದರೇನು?"] },
  hi: { text: "अच्छा सवाल! इस हफ़्ते शिक्षक ने जो पढ़ाया, उसमें मैं मदद कर सकती हूँ। भिन्न, दशमलव या पहाड़े के बारे में पूछो।", suggestions: ["तुल्य भिन्न क्या है?", "दशमलव क्या है?"] },
};

export function tutorReply(message: string, lang: Language): TutorReply {
  const hit = REPLIES.find((r) => r.match.test(message));
  return hit ? hit.reply[lang] : FALLBACK[lang];
}
