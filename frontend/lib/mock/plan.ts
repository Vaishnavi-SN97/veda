// Stand-in for the backend's OR-Tools CP-SAT planner. Same rules, greedy instead of solved:
// - in every lesson period the teacher leads exactly one grade, or all grades together
//   (a merged cross-grade session);
// - the other grades get guided work (self work, peer work or reading);
// - teacher-led time is shared fairly, with extra time for grades that have accepted alerts.

import type {
  BreakSlot,
  Grade,
  GradeSlot,
  Period,
  ReplanRequest,
  SlotMode,
  Topic,
  WeekPlan,
} from "../types";
import { GRADES } from "../types";

const TIMES: [string, string][] = [
  ["09:30", "10:15"],
  ["10:15", "11:00"],
  ["11:15", "12:00"],
  ["12:00", "12:45"],
  ["13:30", "14:15"],
  ["14:15", "15:00"],
  ["15:00", "15:45"],
];

const SUBJECTS: Record<number, string[]> = {
  1: ["Kannada", "Maths", "English", "EVS", "Maths", "Kannada", "Games"],
  2: ["Maths", "Kannada", "EVS", "English", "Maths", "Art", "Reading"],
  3: ["Kannada", "Maths", "English", "Maths", "EVS", "English", "Games"],
  4: ["Maths", "English", "Kannada", "EVS", "Maths", "Kannada", "Reading"],
  5: ["English", "Maths", "Kannada", "Maths", "EVS", "Art", "Games"],
};

// One cross-grade maths session per chapter that all three grades share this term.
const MERGED: { day: number; index: number; chapter: string; note: string; activity: Record<Grade, string> }[] = [
  {
    day: 3,
    index: 1,
    chapter: "Fractions",
    note: "One session, three levels: same paper-folding activity, different questions per grade.",
    activity: {
      3: "Fold paper into halves and quarters (preview)",
      4: "Find equivalent fractions by folding",
      5: "Add like fractions with folded strips",
    },
  },
  {
    day: 5,
    index: 3,
    chapter: "Multiplication",
    note: "One session, three levels: a market game where each grade solves its own price questions.",
    activity: {
      3: "Tables 6–10 with bead strings",
      4: "Revise 2-digit × 2-digit",
      5: "3-digit × 2-digit shop bills",
    },
  },
];

const WHOLE_CLASS = new Set(["Games", "Art", "Reading"]);

const GUIDED: SlotMode[] = ["self_work", "peer_work", "reading"];

function activityFor(subject: string, mode: SlotMode, topic?: Topic): string {
  if (subject === "Maths" && topic) {
    switch (mode) {
      case "teacher_led": return `Teach: ${topic.title}`;
      case "self_work": return `Workbook practice: ${topic.title}`;
      case "peer_work": return `Pair practice: ${topic.title} (older child checks)`;
      case "reading": return "Re-read yesterday's topic cards";
    }
  }
  const table: Record<string, Record<SlotMode, string>> = {
    Kannada: { teacher_led: "Lesson and reading aloud", self_work: "Copy writing", peer_work: "Read to a partner", reading: "Library story book" },
    English: { teacher_led: "Lesson, new words and rhymes", self_work: "Copy writing and spelling", peer_work: "Picture talk with a partner", reading: "Graded reader" },
    EVS: { teacher_led: "Lesson and discussion", self_work: "Draw and label", peer_work: "Group activity", reading: "Read the EVS chapter" },
  };
  return table[subject]?.[mode] ?? subject;
}

export function currentTopic(topics: Topic[], grade: Grade): Topic | undefined {
  const own = topics.filter((t) => t.grade === grade).sort((a, b) => a.order - b.order);
  return own.find((t) => t.status === "in_progress") ?? own.find((t) => t.status === "not_started") ?? own[own.length - 1];
}

export interface PlanInputs {
  weekStart: string;
  topics: Topic[];
  breaks: BreakSlot[];
  // grades that need extra teacher-led maths (from accepted alerts), with the reason
  priorities: { grade: Grade; reason: string; activity: string }[];
}

export function generatePlan({ weekStart, topics, breaks, priorities }: PlanInputs): WeekPlan {
  const topicOf = Object.fromEntries(GRADES.map((g) => [g, currentTopic(topics, g)])) as Record<Grade, Topic | undefined>;
  const led: Record<Grade, number> = { 3: 0, 4: 0, 5: 0 };
  const periods: Period[] = [];
  const notes: string[] = [];
  const pendingPriority = [...priorities];
  let guidedTurn = 0;

  for (const day of [1, 2, 3, 4, 5]) {
    SUBJECTS[day].forEach((subject, index) => {
      const [start, end] = TIMES[index];
      const id = `${weekStart}-d${day}-p${index}`;
      const merged = MERGED.find((m) => m.day === day && m.index === index);

      if (merged) {
        periods.push({
          id, day, index, start, end,
          merged: { chapter: merged.chapter, note: merged.note },
          slots: GRADES.map((g) => ({ grade: g, mode: "teacher_led", subject, activity: merged.activity[g], topicId: topicOf[g]?.id })),
        });
        GRADES.forEach((g) => (led[g] += 45));
        return;
      }

      if (WHOLE_CLASS.has(subject)) {
        const mode: SlotMode = subject === "Reading" ? "reading" : "peer_work";
        periods.push({
          id, day, index, start, end,
          slots: GRADES.map((g) => ({
            grade: g, mode, subject,
            activity: subject === "Games" ? "Outdoor games, mixed-grade teams" : subject === "Art" ? "Art and craft, all grades together" : "Reading corner: pick any story book",
          })),
        });
        return;
      }

      // Priority grades claim the first maths period the teacher has free on day 2 or later.
      let leader: Grade;
      let priorityActivity: string | undefined;
      const pr = subject === "Maths" && day >= 2 ? pendingPriority.shift() : undefined;
      if (pr) {
        leader = pr.grade;
        priorityActivity = pr.activity;
        notes.push(`${dayName(day)} period ${index + 1}: extra teacher time for Grade ${pr.grade}. ${pr.reason}`);
      } else {
        // fairness: the grade with the least teacher-led time so far leads
        leader = [...GRADES].sort((a, b) => led[a] - led[b] || ((a + day + index) % 3) - ((b + day + index) % 3))[0];
      }
      led[leader] += 45;

      const slots: GradeSlot[] = GRADES.map((g) => {
        const mode: SlotMode = g === leader ? "teacher_led" : GUIDED[(guidedTurn + g) % 3];
        const topic = subject === "Maths" ? topicOf[g] : undefined;
        return {
          grade: g, mode, subject, topicId: topic?.id,
          activity: g === leader && priorityActivity ? priorityActivity : activityFor(subject, mode, topic),
        };
      });
      guidedTurn++;
      // periods added because of an accepted alert are highlighted until the teacher approves
      periods.push({ id, day, index, start, end, slots, changed: !!pr });
    });
  }

  notes.unshift(
    "Each lesson period, you teach one grade directly while the other two do guided work.",
    `Merged sessions: ${MERGED.map((m) => `${m.chapter} (${dayName(m.day)})`).join(", ")}, when all three grades learn the same idea at their own level.`,
  );

  return { weekStart, status: "draft", periods, breaks, notes, teacherLedMinutes: led };
}

export function dayName(day: number): string {
  return ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}

export function movePeriod(plan: WeekPlan, fromId: string, toId: string): WeekPlan {
  const periods = plan.periods.map((p) => ({ ...p }));
  const a = periods.find((p) => p.id === fromId);
  const b = periods.find((p) => p.id === toId);
  if (!a || !b || a === b) return plan;
  // swap the lesson content, keep each slot's time
  [a.slots, b.slots] = [b.slots, a.slots];
  [a.merged, b.merged] = [b.merged, a.merged];
  a.changed = true;
  b.changed = true;
  return { ...plan, status: "draft", periods };
}

export function replan(plan: WeekPlan, req: ReplanRequest, topics: Topic[]): WeekPlan {
  const periods = plan.periods.map((p) => ({ ...p, changed: false, slots: p.slots.map((s) => ({ ...s })) }));
  const today = periods.filter((p) => p.day === req.day);
  const notes = [...plan.notes];

  const revisionTopic = (g: Grade) => {
    const done = topics.filter((t) => t.grade === g && t.status === "done").sort((a, b) => b.order - a.order);
    return done[0]?.title ?? "last topic";
  };

  if (req.reason === "rain_day" || req.reason === "many_absent") {
    for (const p of today) {
      if (p.slots[0].subject === "Games") {
        p.slots.forEach((s) => { s.mode = "peer_work"; s.activity = "Indoor games: number antakshari"; });
        p.changed = true;
        continue;
      }
      if (p.slots[0].subject !== "Maths") continue;
      p.merged = { chapter: "Revision", note: "No new topic today so absent children don't miss it. All grades revise together." };
      p.slots.forEach((s) => { s.mode = "teacher_led"; s.activity = `Revise: ${revisionTopic(s.grade)}`; });
      p.changed = true;
    }
    notes.push(
      req.reason === "rain_day"
        ? `Rain day (${dayName(req.day)}): new maths topics moved to the next day; maths periods became merged revision; games moved indoors.`
        : `Many absent (${dayName(req.day)}): no new topics taught; maths periods became merged revision so nobody falls behind.`,
    );
  } else {
    const from = req.fromPeriodIndex ?? 4;
    const lost: Grade[] = [];
    for (const p of today.filter((x) => x.index >= from)) {
      p.merged = undefined;
      p.slots.forEach((s) => {
        if (s.mode === "teacher_led") lost.push(s.grade);
        s.mode = "self_work";
        s.activity = `Self work with class monitor (Grade 5 leader): ${s.subject === "Maths" ? "workbook practice" : "copy writing / reading"}`;
      });
      p.changed = true;
    }
    // give each lost teacher-led period back on the following days
    const later = periods.filter((p) => p.day > req.day && !p.merged && !WHOLE_CLASS.has(p.slots[0].subject));
    const moved: string[] = [];
    for (const g of [...new Set(lost)]) {
      const target = later.find((p) => !p.changed && p.slots.some((s) => s.grade === g && s.mode !== "teacher_led"));
      if (!target) continue;
      target.slots.forEach((s) => {
        if (s.mode === "teacher_led") { s.mode = "self_work"; s.activity = `Workbook practice (${s.subject})`; }
        if (s.grade === g) { s.mode = "teacher_led"; s.activity = `Catch-up lesson (${s.subject})`; }
      });
      target.changed = true;
      moved.push(`Grade ${g} → ${dayName(target.day)} period ${target.index + 1}`);
    }
    notes.push(
      `Teacher on duty (${dayName(req.day)} from period ${from + 1}): those periods are self work with a class monitor.` +
        (moved.length ? ` Teacher time moved: ${moved.join(", ")}.` : ""),
    );
  }

  return { ...plan, status: "draft", periods, notes };
}
