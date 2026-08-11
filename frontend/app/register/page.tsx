'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  Globe,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  User,
  UserRound,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import OtpStep from './OtpStep';

const JENIS_AKUN_OPTIONS = [
  'Pemerintahan',
  'Perguruan Tinggi',
  'Swasta/Dunia Usaha dan Dunia Industri (DUDI)',
  'Sekolah/Institusi Pendidikan Lain',
  'Organisasi Non-Profit / LSM',
  'Lainnya',
] as const;

const TINGKAT_PERUSAHAAN_OPTIONS = ['Lokal', 'Nasional', 'Internasional', 'Multinasional'] as const;

const negaraOptions = [
  'Indonesia',
  'Malaysia',
  'Singapura',
  'Amerika Serikat',
  'Jepang',
  'Korea Selatan',
  'Australia',
  'Jerman',
  'Belanda',
  'Inggris',
  'Tiongkok',
  'Lainnya',
];

const countryPhoneCodeMap: Record<string, string> = {
  'Indonesia':       '+62',
  'Malaysia':        '+60',
  'Singapura':       '+65',
  'Amerika Serikat': '+1',
  'Jepang':          '+81',
  'Korea Selatan':   '+82',
  'Australia':       '+61',
  'Jerman':          '+49',
  'Belanda':         '+31',
  'Inggris':         '+44',
  'Tiongkok':        '+86',
  'Lainnya':         '',
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    institution_name: '',
    negara: 'Indonesia',
    username: '',
    email: '',
    phone: '',
    position: '',
    account_type: '',
    tingkat_perusahaan: '',
    role: 'external',
    password: '',
    password_confirmation: '',
  });
  const [phoneCode, setPhoneCode] = useState('+62');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState<1 | 2>(1);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    if (name === 'negara') {
      setPhoneCode(countryPhoneCodeMap[value] ?? '');
      setForm((prev) => ({ ...prev, negara: value, phone: '' }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!agreeTerms) {
      setError('Silakan setujui syarat dan ketentuan terlebih dahulu.');
      return;
    }

    if (form.password !== form.password_confirmation) {
      setError('Konfirmasi password tidak sama.');
      return;
    }

    setIsLoading(true);
    try {
      const fullPhone = phoneCode
        ? `${phoneCode}${form.phone.replace(/^0+/, '')}`
        : form.phone;
      await apiRequest('/otp/send', {
        method: 'POST',
        body: JSON.stringify({ ...form, phone: fullPhone, role: 'external' }),
      });
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim OTP. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen px-4 py-6"
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/polibatam.jpg')" }}
      />
      {/* Color overlay #0E1D34 50% */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(14,29,52,0.5)' }} />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[30px] border border-white/20 bg-slate-950/70 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-sm">
          <div className="border-b border-white/10 px-5 py-6 text-center text-white md:px-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                <ArrowLeft size={14} />
                Kembali
              </button>

              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                Khusus Mitra Eksternal
              </span>
            </div>

            <h1 className="mt-1 text-2xl font-black uppercase tracking-wide md:text-3xl">
              Registrasi Akun Sikerma Polibatam
            </h1>
            <p className="mt-1 text-sm text-slate-200">
              Lengkapi data mitra untuk mengajukan akun kerja sama.
            </p>
          </div>

          <div className="bg-white/95 px-4 py-5 text-slate-800 md:px-6 md:py-6">
            {step === 2 ? (
              <OtpStep
                email={form.email}
                formData={{ ...form, role: 'external' }}
                onSuccess={() => router.push('/login')}
                onBack={() => { setStep(1); setError(''); setSuccess(''); }}
              />
            ) : (
            <>
            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/90 p-3 text-sm text-slate-600">
              <div className="flex items-start gap-2">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#173B82]" />
                <p>
                  Registrasi ini hanya untuk <span className="font-semibold text-[#173B82]">mitra eksternal</span>.
                  Setelah mendaftar, akun bisa langsung digunakan untuk login
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-4 flex items-center gap-2 text-[#173B82]">
                  <Building2 size={18} />
                  <h2 className="text-base font-bold">Informasi Mitra</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Nama Lengkap</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Masukkan nama lengkap"
                        required
                        className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Email Pengusul</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="Masukkan email pengusul"
                        required
                        className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Nama Perusahaan/Institusi</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        name="institution_name"
                        value={form.institution_name}
                        onChange={handleChange}
                        placeholder="Masukkan nama mitra"
                        required
                        className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Negara Mitra</label>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
                      <select
                        name="negara"
                        value={form.negara}
                        onChange={handleChange}
                        required
                        className="input-field h-11 w-full appearance-none rounded-xl pl-10 pr-10 text-sm text-slate-700"
                      >
                        <option value="" disabled>
                          Pilih negara mitra
                        </option>
                        {negaraOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={18}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#173B82]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Nomor Telepon</label>
                    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-[#173B82] focus-within:ring-1 focus-within:ring-[#173B82]/20">
                      {phoneCode && (
                        <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-600">
                          {phoneCode}
                        </span>
                      )}
                      <div className="relative flex-1">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          name="phone"
                          value={form.phone}
                          onChange={handleChange}
                          placeholder={form.negara === 'Indonesia' ? '8xxxxxxxxxx' : 'Nomor telepon'}
                          required
                          className="h-11 w-full bg-transparent pl-9 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                    {form.negara === 'Indonesia' && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                        <MessageCircle size={12} className="shrink-0" />
                        Pastikan nomor ini aktif di WhatsApp agar mudah dihubungi
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Username</label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        name="username"
                        value={form.username}
                        onChange={handleChange}
                        placeholder="Masukkan username"
                        required
                        pattern="[a-zA-Z0-9_\-]+"
                        title="Username hanya boleh berisi huruf, angka, tanda hubung (-), dan garis bawah (_)."
                        className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Jabatan</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        name="position"
                        value={form.position}
                        onChange={handleChange}
                        placeholder="Masukkan jabatan"
                        required
                        className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        type="password"
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        placeholder="Min 8 karakter"
                        required
                        className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Konfirmasi Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        type="password"
                        name="password_confirmation"
                        value={form.password_confirmation}
                        onChange={handleChange}
                        placeholder="Ulangi password"
                        required
                        className="input-field h-11 w-full rounded-xl pl-10 pr-4 text-sm"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Jenis Akun</label>
                    <div className="relative">
                      <select
                        name="account_type"
                        value={(JENIS_AKUN_OPTIONS.filter(o => o !== 'Lainnya') as string[]).includes(form.account_type) || form.account_type === '' ? form.account_type : 'Lainnya'}
                        onChange={handleChange}
                        required
                        className="input-field h-11 w-full appearance-none rounded-xl px-4 pr-10 text-sm text-slate-600"
                      >
                        <option value="" disabled>Pilih Kategori Mitra</option>
                        {JENIS_AKUN_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#173B82]" />
                    </div>
                    {!(JENIS_AKUN_OPTIONS.filter(o => o !== 'Lainnya') as string[]).includes(form.account_type) && form.account_type !== '' && (
                      <input
                        name="account_type"
                        value={form.account_type === 'Lainnya' ? '' : form.account_type}
                        onChange={(e) => setForm((prev) => ({ ...prev, account_type: e.target.value || 'Lainnya' }))}
                        className="input-field mt-2 h-11 w-full rounded-xl px-4 text-sm text-slate-600"
                        placeholder="Ketik jenis akun..."
                        required
                      />
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-semibold text-[#173B82]">Tingkat Perusahaan</label>
                    <div className="relative">
                      <select
                        name="tingkat_perusahaan"
                        value={form.tingkat_perusahaan}
                        onChange={handleChange}
                        className="input-field h-11 w-full appearance-none rounded-xl px-4 pr-10 text-sm text-slate-600"
                      >
                        <option value="">Pilih tingkat perusahaan</option>
                        {TINGKAT_PERUSAHAAN_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#173B82]" />
                    </div>
                  </div>
                </div>

                <label className="mt-4 inline-flex items-start gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-[#173B82] focus:ring-[#173B82]"
                  />
                  Saya menyetujui syarat dan ketentuan serta kebijakan privasi SIKERMA Polibatam.
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary h-11 w-full rounded-xl font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Memproses...' : 'Daftar Mitra'}
              </button>
            </form>

            <div className="mt-5 text-center text-sm text-slate-600">
              Sudah punya akun?{' '}
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="font-semibold text-[#173B82] hover:underline"
              >
                Masuk di sini
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
