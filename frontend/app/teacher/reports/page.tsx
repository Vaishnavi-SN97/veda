"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { downloadReportPdf, getClass, getReport } from "@/lib/api";
import { Button, Card, GradeChip, Loading, PageHeader, Progress, SectionTitle, TagChip, cx } from "@/components/ui";
import { useLoad } from "@/components/useLoad";

function fmt(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function ReportsPage() {
  const { data } = useLoad(() => Promise.all([getReport(), getClass()]));
  const [exporting, setExporting] = useState(false);
  if (!data) return <Loading />;
  const [r, cls] = data;

  async function exportPdf() {
    setExporting(true);
    try {
      await downloadReportPdf();
    } catch {
      // banner explains
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Reports"
        subtitle={`${cls.name} · ${fmt(r.from)} to ${fmt(r.to)} · ${r.schoolDays} school days`}
        action={
          <Button variant="primary" className="no-print" icon={<FileDown className="size-5" aria-hidden />} loading={exporting} onClick={exportPdf}>
            Export PDF
          </Button>
        }
      />
      <p className="no-print -mt-3 mb-6 text-sm text-ink-3">Downloads a PDF for the school office: attendance, progress and syllabus coverage.</p>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle>Attendance</SectionTitle>
          <div className="space-y-4">
            {r.attendanceByGrade.map((a) => (
              <div key={a.grade}>
                <div className="mb-1.5 flex items-center justify-between">
                  <GradeChip grade={a.grade} />
                  <span className="font-display text-lg font-bold">{a.percent}%</span>
                </div>
                <Progress value={a.percent} />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle>Syllabus coverage</SectionTitle>
          <div className="space-y-4">
            {r.syllabus.map((s) => (
              <div key={s.grade}>
                <div className="mb-1.5 flex items-center justify-between">
                  <GradeChip grade={s.grade} />
                  <span className="text-sm text-ink-3">{s.done}/{s.total} topics · <span className="font-display text-lg font-bold text-ink">{s.percent}%</span></span>
                </div>
                <Progress value={s.percent} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0 sm:p-0">
        <div className="px-4 pt-4 sm:px-5"><SectionTitle>Student progress</SectionTitle></div>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-normal sm:px-5">Student</th>
              <th className="px-2 py-2 font-normal">Grade</th>
              <th className="px-2 py-2 text-right font-normal">Attendance</th>
              <th className="px-2 py-2 text-right font-normal">Avg quiz</th>
              <th className="px-2 py-2 text-right font-normal">Avg test</th>
              <th className="px-4 py-2 font-normal sm:px-5">Status</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.student.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium sm:px-5">{row.student.name}</td>
                <td className="px-2 py-3 text-ink-2">{row.student.grade}</td>
                <td className={cx("px-2 py-3 text-right tabular-nums", row.attendancePercent < 80 ? "text-bad" : "text-ink-2")}>{row.attendancePercent}%</td>
                <td className={cx("px-2 py-3 text-right tabular-nums", row.averageQuizPercent < 50 ? "text-bad" : "text-ink-2")}>{row.averageQuizPercent}%</td>
                <td className={cx("px-2 py-3 text-right tabular-nums", row.averageTestPercent < 40 ? "text-bad" : "text-ink-2")}>{row.averageTestPercent}%</td>
                <td className="px-4 py-3 sm:px-5"><TagChip tag={row.tag} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
