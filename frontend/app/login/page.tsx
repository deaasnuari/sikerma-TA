'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { requestPasswordReset, resetPassword } from '@/services/authService';

function LoginPageContent() {
  const [loginMode, setLoginMode] = useState<'local' | 'campus'>('local');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [campusUsername, setCampusUsername] = useState('');
  const [campusPassword, setCampusPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showFpPassword, setShowFpPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [fpSuccessDone, setFpSuccessDone] = useState(false);

  // Forgot password modal state
  const [fpOpen, setFpOpen] = useState(false);
  const [fpStep, setFpStep] = useState<1 | 2 | 3>(1);
  const [fpEmail, setFpEmail] = useState('');
  const [fpOtp, setFpOtp] = useState(['', '', '', '', '', '']);
  const [fpPassword, setFpPassword] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');
  const [fpError, setFpError] = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [fpCountdown, setFpCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const searchParams = useSearchParams();

  const router = useRouter();
  const { login, loginWithCampus } = useAuth();

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'deleted') {
      setAccountDeleted(true);
    } else if (reason === 'expired') {
      setSessionExpired(true);
    }
  }, [searchParams]);

  const handleModeChange = (mode: 'local' | 'campus') => {
    setLoginMode(mode);
    setError('');
    setAccountDeleted(false);
    setSessionExpired(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccountDeleted(false);
    setSessionExpired(false);
    setIsLoading(true);

    try {
      const loggedInUser =
        loginMode === 'campus'
          ? await loginWithCampus(campusUsername, campusPassword)
          : await login(email, password);

      // 'unit'/'jurusan'/'prodi' — role civitas/LDAP hasil deteksi otomatis (lihat
      // StructuralAccessService::determineCivitasRole() di backend), diarahkan ke
      // dashboard internal yang sama seperti role 'internal' polos.
      const roleRouteMap: Record<string, string> = {
        admin: '/admin',
        pimpinan: '/pimpinan',
        internal: '/internal/dashboard',
        unit: '/internal/dashboard',
        jurusan: '/internal/dashboard',
        prodi: '/internal/dashboard',
        external: '/eksternal',
      };

      router.push(roleRouteMap[loggedInUser.role] || '/admin');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Login gagal. Silakan coba lagi.';

      const isNotFound = /tidak terdaftar/i.test(message);
      if (loginMode === 'local' && isNotFound) {
        setAccountDeleted(true);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openForgotPassword = () => {
    setFpOpen(true);
    setFpStep(1);
    setFpEmail(email.trim());
    setFpOtp(['', '', '', '', '', '']);
    setFpPassword('');
    setFpConfirm('');
    setFpError('');
    setFpCountdown(0);
  };

  const closeForgotPassword = () => {
    setFpOpen(false);
    setFpStep(1);
    setFpEmail('');
    setFpOtp(['', '', '', '', '', '']);
    setFpPassword('');
    setFpConfirm('');
    setFpError('');
  };

  const startCountdown = () => {
    setFpCountdown(60);
    const interval = setInterval(() => {
      setFpCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    if (!fpEmail.trim()) { setFpError('Masukkan email terlebih dahulu.'); return; }
    setFpLoading(true);
    setFpError('');
    try {
      await requestPasswordReset(fpEmail.trim());
      setFpStep(2);
      startCountdown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setFpError(err instanceof Error ? err.message : 'Gagal mengirim OTP. Coba lagi.');
    } finally {
      setFpLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...fpOtp];
    next[index] = digit;
    setFpOtp(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !fpOtp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = () => {
    const code = fpOtp.join('');
    if (code.length < 6) { setFpError('Masukkan 6 digit kode OTP.'); return; }
    setFpError('');
    setFpStep(3);
  };

  const handleResetPassword = async () => {
    if (!fpPassword) { setFpError('Masukkan password baru.'); return; }
    if (fpPassword.length < 8) { setFpError('Password minimal 8 karakter.'); return; }
    if (fpPassword !== fpConfirm) { setFpError('Konfirmasi password tidak cocok.'); return; }
    setFpLoading(true);
    setFpError('');
    try {
      await resetPassword({
        email: fpEmail.trim(),
        otp: fpOtp.join(''),
        password: fpPassword,
        password_confirmation: fpConfirm,
      });
      setFpStep(1);
      setFpOpen(false);
      setError('');
      // Show success message on login form
      setFpSuccessDone(true);
    } catch (err) {
      setFpError(err instanceof Error ? err.message : 'Gagal reset password. Coba lagi.');
      if (/kedaluwarsa/i.test(err instanceof Error ? err.message : '')) {
        setFpStep(2);
        setFpOtp(['', '', '', '', '', '']);
      }
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-slate-900 bg-cover bg-center bg-no-repeat px-4 py-4"
      style={{ backgroundImage: "url('/polibatam.jpg')" }}
    >
      <div className="flex h-full items-center justify-center overflow-y-auto scrollbar-none bg-slate-950/60">
        <div className="w-full max-w-[400px] py-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
              >
                <ArrowLeft size={14} />
                Kembali ke beranda
              </button>

              <img src="/polibatam_logo.png" alt="Logo Polibatam" className="h-8 w-auto object-contain" />
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-extrabold text-slate-900">Login</h1>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#173B82]">
                Sikerma Polibatam
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Masuk untuk mengakses sistem kerja sama Polibatam.
              </p>
            </div>

            <div className="mt-5">
              {error && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <AlertCircle size={17} className="mt-0.5 shrink-0 text-red-600" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}


              {accountDeleted && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={17} className="mt-0.5 shrink-0 text-red-600" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">Akun tidak ditemukan</p>
                      <p className="mt-0.5 text-xs text-red-600">
                        Email/username tidak terdaftar atau akun mitra ini telah dihapus oleh admin. Silakan hubungi administrator jika ini merupakan kesalahan.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {sessionExpired && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={17} className="mt-0.5 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-amber-700">Sesi Anda telah berakhir</p>
                      <p className="mt-0.5 text-xs text-amber-600">
                        Silakan login kembali untuk melanjutkan.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {loginMode === 'campus' && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/90 p-3 text-xs leading-relaxed text-slate-600">
                    Login menggunakan akun LDAP/DOKPOL/Learning Polibatam (akun pegawai/dosen). Role Anda otomatis dikenali dari akun kampus setelah berhasil login.
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">
                    {loginMode === 'campus' ? 'Username Kampus' : 'Email'}
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    {loginMode === 'campus' ? (
                      <input
                        type="text"
                        value={campusUsername}
                        onChange={(e) => setCampusUsername(e.target.value)}
                        placeholder="Username Dokpol/Learning"
                        autoComplete="username"
                        className="input-field h-10 w-full rounded-xl pl-10 pr-4 text-sm"
                        required
                      />
                    ) : (
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Masukkan email terdaftar"
                        autoComplete="email"
                        className="input-field h-10 w-full rounded-xl pl-10 pr-4 text-sm"
                        required
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    {loginMode === 'campus' ? (
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={campusPassword}
                        onChange={(e) => setCampusPassword(e.target.value)}
                        placeholder="Password Dokpol/Learning"
                        autoComplete="current-password"
                        className="input-field h-10 w-full rounded-xl pl-10 pr-10 text-sm"
                        required
                      />
                    ) : (
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan password akun"
                        autoComplete="current-password"
                        className="input-field h-10 w-full rounded-xl pl-10 pr-10 text-sm"
                        required
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary h-10 w-full rounded-xl font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Memproses...' : 'Masuk'}
                </button>

                {loginMode === 'local' && (
                  <div className="flex items-center justify-end pt-1 text-xs text-slate-600">
                    <button
                      type="button"
                      onClick={openForgotPassword}
                      className="font-semibold text-[#173B82] transition hover:underline"
                    >
                      Lupa Password?
                    </button>
                  </div>
                )}
                {fpSuccessDone && (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <p className="text-xs text-emerald-700 font-medium">Password berhasil direset. Silakan login dengan password baru Anda.</p>
                  </div>
                )}

                {loginMode === 'local' ? (
                  <>
                    <div className="flex items-center gap-3 pt-1">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[11px] font-medium text-slate-400">Atau masuk dengan</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleModeChange('campus')}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <GraduationCap size={16} className="text-[#173B82]" />
                      Login dengan Akun Kampus
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleModeChange('local')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#173B82] hover:underline"
                  >
                    <ArrowLeft size={12} />
                    Kembali ke login Email &amp; Password
                  </button>
                )}

                {loginMode === 'local' && (
                  <p className="text-[11px] text-slate-500">
                    Gunakan email yang terdaftar dan password akun Anda untuk masuk.
                  </p>
                )}
              </form>

              {loginMode === 'local' && (
                <>
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/90 p-3 text-xs leading-relaxed text-slate-600">
                    Registrasi mandiri saat ini hanya untuk <span className="font-semibold text-[#173B82]">mitra eksternal</span>.
                    Setelah daftar, akun mitra bisa langsung login tanpa menunggu approval.
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
                    Belum punya akun mitra?{' '}
                    <button
                      type="button"
                      onClick={() => router.push('/register')}
                      className="font-semibold text-[#173B82] hover:underline"
                    >
                      Registrasi Mitra
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {fpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto scrollbar-none rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#173B82]/10">
                  <KeyRound size={18} className="text-[#173B82]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">Reset Password</h3>
                  <p className="text-[11px] text-slate-500">
                    {fpStep === 1 && 'Masukkan email akun Anda'}
                    {fpStep === 2 && 'Masukkan kode OTP dari email'}
                    {fpStep === 3 && 'Buat password baru'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={closeForgotPassword} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Steps indicator */}
            <div className="flex items-center gap-2 px-6 pt-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                    fpStep > s ? 'bg-emerald-500 text-white' : fpStep === s ? 'bg-[#173B82] text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {fpStep > s ? <CheckCircle2 size={13} /> : s}
                  </div>
                  {s < 3 && <div className={`h-px w-8 transition-colors ${fpStep > s ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                </div>
              ))}
              <span className="ml-2 text-[11px] text-slate-500">
                {fpStep === 1 && 'Email'}
                {fpStep === 2 && 'Verifikasi OTP'}
                {fpStep === 3 && 'Password Baru'}
              </span>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {fpError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600">{fpError}</p>
                </div>
              )}

              {fpStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email Akun</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="email"
                        value={fpEmail}
                        onChange={(e) => setFpEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void handleSendOtp()}
                        placeholder="Masukkan email terdaftar"
                        className="input-field h-10 w-full rounded-xl pl-9 pr-4 text-sm"
                        autoFocus
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">Kode OTP akan dikirim ke email ini.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSendOtp()}
                    disabled={fpLoading}
                    className="btn-primary h-10 w-full rounded-xl text-sm font-semibold disabled:opacity-60"
                  >
                    {fpLoading ? 'Mengirim...' : 'Kirim Kode OTP'}
                  </button>
                </div>
              )}

              {fpStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600">
                      Kode OTP dikirim ke <span className="font-semibold text-[#173B82]">{fpEmail}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">Berlaku selama 5 menit. Periksa folder spam jika tidak masuk.</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Kode OTP (6 digit)</label>
                    <div className="flex gap-2">
                      {fpOtp.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => { otpRefs.current[i] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          className="h-12 w-full rounded-xl border border-slate-300 bg-white text-center text-lg font-bold text-[#173B82] focus:border-[#173B82] focus:outline-none focus:ring-2 focus:ring-[#173B82]/20"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      {fpCountdown > 0 ? `Kirim ulang dalam ${fpCountdown}s` : 'Tidak menerima kode?'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSendOtp()}
                      disabled={fpCountdown > 0 || fpLoading}
                      className="inline-flex items-center gap-1 font-semibold text-[#173B82] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw size={11} />
                      Kirim Ulang
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={fpOtp.join('').length < 6}
                    className="btn-primary h-10 w-full rounded-xl text-sm font-semibold disabled:opacity-60"
                  >
                    Verifikasi Kode
                  </button>
                </div>
              )}

              {fpStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Buat password baru untuk akun <span className="font-semibold text-[#173B82]">{fpEmail}</span></p>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Password Baru</label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type={showFpPassword ? 'text' : 'password'}
                        value={fpPassword}
                        onChange={(e) => setFpPassword(e.target.value)}
                        placeholder="Minimal 8 karakter"
                        className="input-field h-10 w-full rounded-xl pl-9 pr-10 text-sm"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowFpPassword((v) => !v)}
                        aria-label={showFpPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        title={showFpPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                      >
                        {showFpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Konfirmasi Password</label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type={showFpPassword ? 'text' : 'password'}
                        value={fpConfirm}
                        onChange={(e) => setFpConfirm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void handleResetPassword()}
                        placeholder="Ulangi password baru"
                        className="input-field h-10 w-full rounded-xl pl-9 pr-4 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleResetPassword()}
                    disabled={fpLoading}
                    className="btn-primary h-10 w-full rounded-xl text-sm font-semibold disabled:opacity-60"
                  >
                    {fpLoading ? 'Menyimpan...' : 'Reset Password'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
