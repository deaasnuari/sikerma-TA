'use client';

import { CheckCircle2, Clock, Circle, XCircle } from 'lucide-react';
import { ALL_STAGES, GROUP_CONFIG, STAGE_DIBATALKAN, type StageGroup } from '@/services/tahapanPengajuanService';

interface TahapanData {
  stage: string | null;
  group: StageGroup | null;
}

export default function TahapanStepper({ tahapan }: { tahapan: TahapanData }) {
  if (!tahapan.stage) {
    return <p className="text-[12px] text-gray-400 italic py-3 text-center">Belum ada tahapan yang ditetapkan.</p>;
  }

  const stageInfo   = ALL_STAGES.find((s) => s.name === tahapan.stage);
  const cfg         = tahapan.group ? GROUP_CONFIG[tahapan.group] : GROUP_CONFIG['todo'];
  const isDibatalkan = tahapan.stage === STAGE_DIBATALKAN;

  const badgeClass = isDibatalkan
    ? 'bg-red-50 text-red-700 border-red-200'
    : cfg.badge;

  const dotClass = isDibatalkan
    ? 'bg-red-500'
    : (stageInfo?.dot ?? 'bg-gray-300');

  const icon = isDibatalkan
    ? <XCircle size={18} className="text-red-500" />
    : tahapan.group === 'complete'
      ? <CheckCircle2 size={18} className="text-green-500" />
      : tahapan.group === 'in_progress'
        ? <Clock size={18} className="text-blue-500" />
        : <Circle size={18} className="text-gray-300" />;

  return (
    <div className="flex items-center gap-3 py-1">
      <div>{icon}</div>
      <div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          {tahapan.stage}
        </span>
        <p className={`mt-0.5 text-[10px] ${isDibatalkan ? 'text-red-400' : 'text-gray-400'}`}>
          {isDibatalkan ? 'Dibatalkan / Dihentikan' : cfg.label}
        </p>
      </div>
    </div>
  );
}
