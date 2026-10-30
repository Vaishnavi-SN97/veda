"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, MessageCircle, PartyPopper, Volume2, XCircle } from "lucide-react";
import { getStudentToday, submitQuiz } from "@/lib/api";
import type { CardDeck, QuizResult, Student, StudentToday } from "@/lib/types";
import { StudentShell } from "@/components/StudentShell";
import { Button, Card, Loading, Progress, cx } from "@/components/ui";
import { speak, stopSpeaking } from "@/components/speech";

export default function TodayPage() {
  return <StudentShell>{(s) => <Today student={s} />}</StudentShell>;
}

function Today({ student }: { student: Student }) {
  const [today, setToday] = useState<StudentToday | null>(null);
  const [open, setOpen] = useState<CardDeck | null>(null);

  useEffect(() => {
    getStudentToday(student.id).then(setToday);
  }, [student.id]);

  if (!today) return <Loading />;
  if (open) return <DeckPlayer deck={open} student={student} onExit={() => { setOpen(null); getStudentToday(student.id).then(setToday); }} />;

  return (
    <div>
      <h1 className="mb-4 text-2xl">New today</h1>
      {today.decks.length === 0 ? (
        <Card className="text-center">
          <PartyPopper className="mx-auto mb-3 size-10 text-accent" strokeWidth={1.5} aria-hidden />
          <p className="text-lg">All done! Nothing new right now.</p>
          <p className="mt-1 text-ink-3">You can still ask Vidya anything about your lessons.</p>
          <Link href="/student/vidya" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-ink">
            <MessageCircle className="size-5" aria-hidden /> Ask Vidya
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {today.decks.map((d) => (
            <li key={d.id}>
              <button onClick={() => setOpen(d)} className="w-full rounded-2xl border border-line bg-card p-4 text-left transition hover:border-accent active:scale-[0.99]">
                <p className="text-xs uppercase tracking-wider text-accent">From your teacher</p>
                <p className="mt-1 font-display text-xl font-bold">{d.topicTitle}</p>
                <p className="mt-1 text-sm text-ink-3">{d.cards.length} cards · {d.quiz.length} quiz questions</p>
                <span className="mt-3 inline-flex items-center gap-1 text-accent">Start <ArrowRight className="size-4" aria-hidden /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeckPlayer({ deck, student, onExit }: { deck: CardDeck; student: Student; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [quiz, setQuiz] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const startX = useRef<number | null>(null);
  const card = deck.cards[i];
  const last = i === deck.cards.length - 1;

  useEffect(() => () => stopSpeaking(), []);

  const go = (n: number) => {
    stopSpeaking();
    setSpeaking(false);
    setI(Math.max(0, Math.min(deck.cards.length - 1, n)));
  };

  if (quiz) return <Quiz deck={deck} student={student} onExit={onExit} />;

  return (
    <div>
      <button onClick={onExit} className="mb-3 flex min-h-11 items-center gap-1 text-accent">
        <ArrowLeft className="size-5" aria-hidden /> Back
      </button>
      <p className="mb-2 text-sm text-ink-3">{deck.topicTitle}</p>
      <Progress value={((i + 1) / deck.cards.length) * 100} className="mb-4" />

      <div
        className="touch-pan-y select-none"
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          if (dx < -50) go(i + 1);
          if (dx > 50) go(i - 1);
          startX.current = null;
        }}
      >
        <Card key={card.id} className="flex min-h-80 flex-col p-6">
          <p className="text-sm text-ink-3">Card {i + 1} of {deck.cards.length}</p>
          <h2 className="mt-2 text-2xl leading-tight">{card.title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">{card.body}</p>
          {card.example && <p className="mt-5 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 font-display text-xl font-bold text-accent">{card.example}</p>}
          <button
            onClick={() => speak(`${card.title}. ${card.body} ${card.example ?? ""}`, deck.language, () => setSpeaking(true), () => setSpeaking(false))}
            className={cx("mt-auto flex min-h-12 items-center gap-2 self-start pt-4", speaking ? "text-accent" : "text-ink-3")}
          >
            <Volume2 className="size-5" aria-hidden /> {speaking ? "Reading aloud…" : "Read it to me"}
          </button>
        </Card>
      </div>
      <p className="mt-2 text-center text-xs text-ink-3">Swipe for the next card</p>

      <div className="mt-4 flex gap-3">
        <Button className="flex-1" disabled={i === 0} onClick={() => go(i - 1)} icon={<ArrowLeft className="size-5" aria-hidden />}>
          Back
        </Button>
        {last ? (
          <Button variant="primary" className="flex-1" onClick={() => { stopSpeaking(); setQuiz(true); }}>
            Start quiz <ArrowRight className="size-5" aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" className="flex-1" onClick={() => go(i + 1)}>
            Next <ArrowRight className="size-5" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

function Quiz({ deck, student, onExit }: { deck: CardDeck; student: Student; onExit: () => void }) {
  const [n, setN] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const q = deck.quiz[n];

  async function next() {
    const all = [...answers, chosen!];
    setAnswers(all);
    setChosen(null);
    if (n + 1 < deck.quiz.length) setN(n + 1);
    else setResult(await submitQuiz(student.id, { deckId: deck.id, answers: all }));
  }

  if (result) {
    return (
      <Card className="text-center">
        <PartyPopper className="mx-auto mb-3 size-12 text-accent" strokeWidth={1.5} aria-hidden />
        <p className="font-display text-5xl font-bold">{result.correct}/{result.total}</p>
        <p className="mt-2 text-lg text-ink-2">{result.percent >= 80 ? "Super! You've got it." : result.percent >= 50 ? "Good try! Revise once more." : "Let's learn this together with Vidya."}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/student/vidya" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-ink">
            <MessageCircle className="size-5" aria-hidden /> Ask Vidya about {deck.topicTitle}
          </Link>
          <Button onClick={onExit}>Done</Button>
        </div>
      </Card>
    );
  }

  const answered = chosen !== null;
  return (
    <div>
      <p className="mb-2 text-sm text-ink-3">Quiz · question {n + 1} of {deck.quiz.length}</p>
      <Progress value={(n / deck.quiz.length) * 100} className="mb-5" />
      <h2 className="mb-5 text-xl leading-snug">{q.question}</h2>
      <div className="space-y-3">
        {q.options.map((o, j) => {
          const right = answered && j === q.answerIndex;
          const wrong = answered && j === chosen && j !== q.answerIndex;
          return (
            <button
              key={j}
              disabled={answered}
              onClick={() => setChosen(j)}
              className={cx(
                "flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 text-left text-lg transition active:scale-[0.99]",
                right ? "border-good bg-good/10" : wrong ? "border-bad bg-bad/10" : "border-line bg-card",
                answered && !right && !wrong && "opacity-50",
              )}
            >
              <span className="font-display font-bold text-ink-3">{String.fromCharCode(65 + j)}</span>
              <span className="flex-1">{o}</span>
              {right && <CheckCircle2 className="size-6 text-good" aria-label="Right answer" />}
              {wrong && <XCircle className="size-6 text-bad" aria-label="Your answer" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-5">
          <p className={cx("mb-3 text-lg", chosen === q.answerIndex ? "text-good" : "text-ink-2")}>
            {chosen === q.answerIndex ? "Correct!" : "Not this time."} {q.explanation}
          </p>
          <Button variant="primary" size="lg" className="w-full" onClick={next}>
            {n + 1 < deck.quiz.length ? "Next question" : "See my score"} <ArrowRight className="size-5" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
