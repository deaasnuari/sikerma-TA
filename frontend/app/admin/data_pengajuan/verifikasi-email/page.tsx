'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck, ShieldCheck, ExternalLink } from 'lucide-react';
import { markPengajuanEmailVerified } from '@/services/adminPengajuanService';

function getEmailAction(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() || '';

  if (domain.includes('gmail')) {
    return { label: 'Buka Gmail', href: 'https://mail.google.com' };
  }

  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
    return { label: 'Buka Outlook', href: 'https://outlook.live.com/mail/0/' };
  }

  if (domain.includes('yahoo')) {
    return { label: 'Buka Yahoo Mail', href: 'https://mail.yahoo.com' };
  }

  return { label: 'Buka Email', href: `mailto:${email}` };
}

export default function VerifikasiEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const email = searchParams.get('email') || 'email@anda.com';
  const pengajuanId = Number(searchParams.get('id') || '0');
  const emailAction = getEmailAction(email);

  const handleVerified = async () => {
    try {
      if (pengajuanId) {
        await markPengajuanEmailVerified(pengajuanId);
      }

      alert('Verifikasi email dikonfirmasi. Pengajuan siap diproses lebih lanjut.');
      router.push('/admin/data_pengajuan');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal memperbarui status verifikasi email.';
      alert(message);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl card p-6 md:p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-sky-100 text-[#3B82F6] flex items-center justify-center mb-5">
          <MailCheck size={30} />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Verifikasi Email Pengusul</h1>
        <p className="text-gray-600 mt-3 text-sm md:text-base leading-relaxed">
          Pengajuan sudah berhasil dikirim. Silakan buka email di bawah ini untuk memastikan bahwa alamat email Anda aktif.
        </p>

        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-5">
          <p className="text-sm text-slate-500">Email tujuan verifikasi</p>
          <p className="text-xl md:text-3xl font-bold text-[#091222] mt-2 break-all">{email}</p>
          <p className="text-sm text-slate-500 mt-3">
            Cek folder inbox atau spam. Proses konfirmasi biasanya membutuhkan beberapa menit.
          </p>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={emailAction.href}
            target="_blank"
            rel="noreferrer"
            className="btn-primary w-full sm:w-auto"
          >
            <ExternalLink size={16} />
            {emailAction.label}
          </a>

          <button
            type="button"
            onClick={handleVerified}
            className="btn-secondary w-full sm:w-auto"
          >
            <ShieldCheck size={16} />
            Saya Sudah Verifikasi
          </button>
        </div>

        <div className="mt-5 text-sm text-gray-600">
          <Link href="/admin/data_pengajuan" className="font-semibold text-[#173B82] hover:text-[#3B82F6]">
            Kembali ke Data Pengajuan
          </Link>
        </div>
      </div>
    </div>
  );
}
