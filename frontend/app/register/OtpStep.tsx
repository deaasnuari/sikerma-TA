'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, Clock, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { RegisterPayload } from '@/types/auth';

interface OtpStepProps {
  email: string;
  formData: RegisterPayload;
  onSuccess: () => void;
  onBack: () => void;
}

export default function OtpStep({ email, formData, onSuccess, onBack }: OtpStepProps) {
  const [otp, setOtp] = useState('');
  const [timeLeft, setTimeLeft] = useState(300); // 5 menit = 300 detik
  const [isExpired, setIsExpired] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isExpired || otp.length !== 6) return;

    setError('');
    setSuccess('');
    setIsVerifying(true);

    try {
      await apiRequest('/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });

      setSuccess('Verifikasi berhasil! Akun Anda sudah aktif.');
      setTimeout(() => onSuccess(), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verifikasi OTP gagal. Periksa kembali kode Anda.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    setIsResending(true);

    try {
      await apiRequest('/otp/send', {
        method: 'POST',
        body: JSON.stringify({ ...formData, role: 'external' }),
      });

      // Reset timer
      if (intervalRef.current) clearInterval(intervalRef.current);
      setOtp('');
      setTimeLeft(300);
      setIsExpired(false);

      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setSuccess('Kode OTP baru sudah dikirim ke email Anda.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim ulang OTP. Coba lagi.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info header */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/90 p-3 text-sm text-slate-600">
        <div className="flex items-start gap-2">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#173B82]" />
          <p>
            Kode OTP 6 digit telah dikirim ke{' '}
            <span className="font-semibold text-[#173B82]">{email}</span>.
            Masukkan kode tersebut sebelum waktu habis.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        {/* Timer */}
        <div className="mb-5 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-2">
            <Clock size={16} className={isExpired ? 'text-red-500' : 'text-[#173B82]'} />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Sisa Waktu
            </span>
          </div>
          <span
            className={`text-4xl font-black tabular-nums tracking-wider ${
              isExpired ? 'text-red-500' : timeLeft <= 60 ? 'text-orange-500' : 'text-[#173B82]'
            }`}
          >
            {formatTime(timeLeft)}
          </span>
          {isExpired && (
            <p className="mt-1 text-xs font-semibold text-red-500">Kode OTP sudah kedaluwarsa</p>
          )}
        </div>

        {/* OTP Form */}
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">
              Kode OTP
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Masukkan 6 digit kode OTP"
                disabled={isExpired || isVerifying}
                required
                className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-center text-lg font-bold tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isExpired || isVerifying || otp.length !== 6}
            className="btn-primary h-11 w-full rounded-xl font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isVerifying ? 'Memverifikasi...' : 'Verifikasi & Daftar'}
          </button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">atau</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Resend OTP */}
        <button
          type="button"
          onClick={handleResend}
          disabled={!isExpired || isResending}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            isExpired
              ? 'border-[#173B82] bg-white text-[#173B82] hover:bg-blue-50'
              : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
          }`}
        >
          <RefreshCw size={14} className={isResending ? 'animate-spin' : ''} />
          {isResending ? 'Mengirim ulang...' : isExpired ? 'Kirim Ulang OTP' : 'Kirim Ulang (tersedia setelah habis)'}
        </button>
      </div>

      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        disabled={isVerifying || isResending}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#173B82] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft size={16} />
        Kembali ke Form Data Diri
      </button>
    </div>
  );
}
