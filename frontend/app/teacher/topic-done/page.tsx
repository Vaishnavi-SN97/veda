"use client";

import { useEffect, useState } from "react";
import { BookCheck, CheckCircle2, Database, RefreshCw, Send, Sparkles } from "lucide-react";
import { getDeck, getTopics, markTopicDone, regenerateDeck, sendDeck } from "@/lib/api";
import type { CardDeck, Grade, Language, Topic } from "@/lib/types";
import { Button, Card, GradePicker, Loading, Notice, PageHeader, SectionTitle, Segmented, cx } from "@/components/ui";

const LANGS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "hi", label: "हिंदी" },
];

const field = "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-ink placeholder:text-ink-3";

export default function TopicDonePage() {
  const [grade, setGrade] = useState<Grade>(4);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [topicId, setTopicId] = useState("");
  const [lang, setLang] = useState<Language>("en");
  const [deck, setDeck] = useState<CardDeck | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sent, setSent] = useState(false);

  function changeGrade(g: Grade) {
    setGrade(g);
    setTopics(null);
    setDeck(null);
    setSent(false);
  }

  useEffect(() => {
    getTopics(grade).then((t) => {
      setTopics(t);
      setTopicId((t.find((x) => x.status === "in_progress") ?? t.find((x) => x.status === "not_started") ?? t[t.length - 1]).id);
    });
  }, [grade]);

  const topic = topics?.find((t) => t.id === topicId);

  async function prepare(l: Language = lang) {
    if (!topic) return;
    setLoadingDeck(true);
    setSent(false);
    try {
      if (topic.status !== "done") {
        const done = await markTopicDone(topic.id);
        setTopics((ts) => ts?.map((t) => (t.id === done.id ? done : t)) ?? null);
      }
      setDeck(await getDeck(topic.id, l));
    } catch {
      // error banner explains
    } finally {
      setLoadingDeck(false);
    }
  }

  async function switchLang(l: Language) {
    setLang(l);
    if (deck) await prepare(l);
  }

  async function regenerate() {
    if (!deck || !confirm("Write a fresh set of cards and quiz for this topic? This uses one Sarvam AI call and replaces your edits.")) return;
    setRegenerating(true);
    setSent(false);
    try {
      setDeck(await regenerateDeck(deck.id));
    } catch {
      // error banner explains
    } finally {
      setRegenerating(false);
    }
  }

  function editCard(i: number, key: "title" | "body" | "example", value: string) {
    if (!deck) return;
    setDeck({ ...deck, cards: deck.cards.map((c, j) => (j === i ? { ...c, [key]: value } : c)) });
  }

  function editQuestion(i: number, patch: Partial<CardDeck["quiz"][number]>) {
    if (!deck) return;
    setDeck({ ...deck, quiz: deck.quiz.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  }

  async function send() {
    if (!deck) return;
    setSending(true);
    try {
      setDeck(await sendDeck(deck)); // sending also saves your edits
      setSent(true);
    } catch {
      // error banner explains
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Mark topic done" subtitle="Finish a topic and Veda prepares revision cards and a 5-question quiz. You check them before anything goes home." />

      <div className="mb-4"><GradePicker value={grade} onChange={changeGrade} /></div>

      {!topics ? (
        <Loading />
      ) : (
        <Card className="mb-6">
          <label className="block">
            <span className="mb-1 block text-sm text-ink-2">Which topic did you finish?</span>
            <select value={topicId} onChange={(e) => { setTopicId(e.target.value); setDeck(null); setSent(false); }} className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-ink">
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.status === "done" ? "✓ " : t.status === "in_progress" ? "▶ " : ""}
                  {t.chapter}: {t.title}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<BookCheck className="size-5" aria-hidden />} loading={loadingDeck} onClick={() => prepare()} disabled={!topic}>
              {topic?.status === "done" ? "Prepare cards + quiz" : "Mark done & prepare cards"}
            </Button>
            {topic?.status === "done" && <span className="flex items-center gap-1.5 text-sm text-good"><CheckCircle2 className="size-4" aria-hidden /> Marked done{topic.doneOn && ` on ${topic.doneOn}`}</span>}
          </div>
        </Card>
      )}

      {loadingDeck && <Loading label="Preparing cards from the textbook topic…" />}

      {deck && !loadingDeck && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Language" value={lang} onChange={switchLang} options={LANGS} />
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm text-ink-3">
                {deck.cached ? <Database className="size-4" aria-hidden /> : <Sparkles className="size-4 text-accent" aria-hidden />}
                {deck.cached ? "Saved copy, no AI cost" : "New draft, now saved"}
              </span>
              <Button variant="ghost" icon={<RefreshCw className="size-4" aria-hidden />} loading={regenerating} onClick={regenerate} title="Write a fresh set of cards and quiz (uses one Sarvam AI call)">
                Regenerate
              </Button>
            </div>
          </div>

          {deck.placeholder && (
            <div className="mb-5">
              <Notice>
                Placeholder text: Sarvam couldn&apos;t write this deck (it is off, or its answer failed the checks twice), so these cards quote the textbook pages and the quiz is simple practice sums. Press Regenerate to try again, or edit before sending.
              </Notice>
            </div>
          )}

          {sent && (
            <div className="mb-5">
              <Notice tone="good">
                Sent to Grade {deck.grade}. The cards are posted to Google Classroom as a material and the quiz as coursework. Students will see them under “New today”.
              </Notice>
            </div>
          )}

          <SectionTitle>Cards · {deck.cards.length}</SectionTitle>
          <div className="mb-8 space-y-3">
            {deck.cards.map((c, i) => (
              <Card key={c.id} className="space-y-2">
                <p className="text-xs text-ink-3">Card {i + 1}</p>
                <input aria-label={`Card ${i + 1} title`} value={c.title} onChange={(e) => editCard(i, "title", e.target.value)} className={cx(field, "font-display font-bold")} />
                <textarea aria-label={`Card ${i + 1} text`} value={c.body} rows={3} onChange={(e) => editCard(i, "body", e.target.value)} className={field} />
                <input aria-label={`Card ${i + 1} example`} value={c.example ?? ""} placeholder="Example (optional)" onChange={(e) => editCard(i, "example", e.target.value)} className={cx(field, "font-mono text-sm")} />
              </Card>
            ))}
          </div>

          <SectionTitle>Quiz · {deck.quiz.length} questions</SectionTitle>
          <div className="space-y-3">
            {deck.quiz.map((q, i) => (
              <Card key={q.id}>
                <p className="mb-2 text-xs text-ink-3">Question {i + 1} · tap the circle to set the right answer</p>
                <input aria-label={`Question ${i + 1}`} value={q.question} onChange={(e) => editQuestion(i, { question: e.target.value })} className={cx(field, "mb-3 font-medium")} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {q.options.map((o, j) => (
                    <div key={j} className={cx("flex items-center gap-2 rounded-xl border p-1 pl-2", j === q.answerIndex ? "border-good/60" : "border-line")}>
                      <button
                        onClick={() => editQuestion(i, { answerIndex: j })}
                        aria-label={`Make option ${j + 1} the right answer`}
                        aria-pressed={j === q.answerIndex}
                        className={cx("flex size-10 shrink-0 items-center justify-center rounded-full border", j === q.answerIndex ? "border-good bg-good/20 text-good" : "border-line text-ink-3")}
                      >
                        {j === q.answerIndex ? <CheckCircle2 className="size-5" aria-hidden /> : String.fromCharCode(65 + j)}
                      </button>
                      <input
                        aria-label={`Question ${i + 1} option ${j + 1}`}
                        value={o}
                        onChange={(e) => editQuestion(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                        className="min-h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-ink"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <div className="sticky bottom-20 z-20 mt-6 lg:bottom-4">
            <Button variant="primary" size="lg" className="w-full shadow-lg shadow-black/50" icon={<Send className="size-5" aria-hidden />} loading={sending} onClick={send}>
              {deck.status === "sent" ? `Send again to Grade ${deck.grade}` : `Send to Grade ${deck.grade}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
