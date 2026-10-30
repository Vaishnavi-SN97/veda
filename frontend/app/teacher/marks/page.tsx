"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { getMarks, getStudents, getTopics, saveMarks } from "@/lib/api";
import type { Grade, MarksSheet, Student, Topic } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Button, Card, GradePicker, Loading, Notice, PageHeader, cx } from "@/components/ui";

export default function MarksPage() {
  const [grade, setGrade] = useState<Grade>(4);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [sheet, setSheet] = useState<MarksSheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function changeGrade(g: Grade) {
    setGrade(g);
    setSheet(null);
    setSaved(false);
  }

  function changeTopic(id: string) {
    setTopicId(id);
    setSaved(false);
  }

  useEffect(() => {
    Promise.all([getTopics(grade), getStudents(grade)]).then(([t, s]) => {
      const taught = t.filter((x) => x.status !== "not_started");
      setTopics(taught);
      setStudents(s);
      // default: the most recent finished topic
      const lastDone = [...taught].reverse().find((x) => x.status === "done") ?? taught[taught.length - 1];
      setTopicId(lastDone?.id ?? "");
    });
  }, [grade]);

  useEffect(() => {
    if (!topicId) return;
    getMarks(grade, topicId).then(setSheet);
  }, [grade, topicId]);

  function setScore(studentId: string, raw: string) {
    if (!sheet) return;
    const n = raw === "" ? null : Math.max(0, Math.min(sheet.maxScore, Number(raw)));
    setSaved(false);
    setSheet({ ...sheet, entries: sheet.entries.map((e) => (e.studentId === studentId ? { ...e, score: Number.isNaN(n) ? null : n } : e)) });
  }

  async function save() {
    if (!sheet) return;
    setSaving(true);
    setSheet(await saveMarks(sheet));
    setSaving(false);
    setSaved(true);
  }

  const entered = sheet?.entries.filter((e) => e.score !== null) ?? [];
  const avg = entered.length && sheet ? Math.round((entered.reduce((a, e) => a + (e.score ?? 0), 0) / entered.length / sheet.maxScore) * 100) : null;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Add marks" subtitle="Test marks per grade and topic. Low scores feed the early-warning alerts." />

      <div className="mb-4"><GradePicker value={grade} onChange={changeGrade} /></div>

      <Card className="mb-5 grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">Topic</span>
          <select value={topicId} onChange={(e) => changeTopic(e.target.value)} className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-ink">
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.chapter}: {t.title}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">Test name</span>
          <input
            value={sheet?.testName ?? ""}
            onChange={(e) => sheet && setSheet({ ...sheet, testName: e.target.value })}
            className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">Out of</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={sheet?.maxScore ?? ""}
            onChange={(e) => sheet && setSheet({ ...sheet, maxScore: Math.max(1, Number(e.target.value) || 1) })}
            className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-ink"
          />
        </label>
      </Card>

      {saved && <div className="mb-5"><Notice tone="good">Marks saved. Student insights and alerts will use them.</Notice></div>}

      {!sheet ? (
        <Loading />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-3">{entered.length} of {sheet.entries.length} entered{avg !== null && <> · class average <span className="text-ink-2">{avg}%</span></>}</p>
          <ul className="space-y-2">
            {sheet.entries.map((e) => {
              const st = students.find((s) => s.id === e.studentId);
              const low = e.score !== null && e.score / sheet.maxScore < 0.4;
              return (
                <li key={e.studentId} className={cx("flex items-center gap-3 rounded-2xl border bg-card p-2 pl-3", low ? "border-bad/50" : "border-line")}>
                  {st && <Avatar picture={st.avatar} size="sm" />}
                  <span className="flex-1 truncate font-medium">{st?.name}</span>
                  {low && <span className="text-xs text-bad">low</span>}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={sheet.maxScore}
                    value={e.score ?? ""}
                    onChange={(ev) => setScore(e.studentId, ev.target.value)}
                    aria-label={`${st?.name} marks out of ${sheet.maxScore}`}
                    placeholder="–"
                    className="min-h-12 w-20 rounded-xl border border-line bg-bg text-center font-display text-lg font-bold text-ink"
                  />
                  <span className="w-10 text-sm text-ink-3">/{sheet.maxScore}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="sticky bottom-20 z-20 mt-6 lg:bottom-4">
        <Button variant="primary" size="lg" className="w-full shadow-lg shadow-black/50" icon={saved ? <Check className="size-5" aria-hidden /> : <Save className="size-5" aria-hidden />} loading={saving} disabled={!sheet} onClick={save}>
          {saved ? "Saved" : "Save marks"}
        </Button>
      </div>
    </div>
  );
}
