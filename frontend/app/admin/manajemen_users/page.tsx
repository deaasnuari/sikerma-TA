'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  Shield,
  UserCheck,
  GraduationCap,
  Building2,
  Handshake,
  AlertCircle,
  X,
  RefreshCw,
  ClockAlert,
} from 'lucide-react';
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  type UiRole,
  type UiStatus,
  updateAdminUser,
  updateAdminUserStatus,
} from '@/services/adminUserService';

interface UserItem {
  id: number;
  nama: string;
  email: string;
  role: UiRole;
  unitInstansi: string;
  status: UiStatus;
  username?: string;
  phone?: string;
}

const fallbackUsers: UserItem[] = [
  {
    id: 1,
    nama: 'Ahmad Fauzi',
    email: 'ahmad.fauzi@polibatam.ac.id',
    role: 'Admin',
    unitInstansi: 'Sistem Informasi',
    status: 'Aktif',
  },
  {
    id: 2,
    nama: 'Siti Nurhaliza',
    email: 'siti.nur@polibatam.ac.id',
    role: 'Jurusan',
    unitInstansi: 'Jurusan Teknik',
    status: 'NonAktif',
  },
  {
    id: 3,
    nama: 'Budi Santoso',
    email: 'budi.santoso@polibatam.ac.id',
    role: 'Prodi',
    unitInstansi: 'Teknik Informatika',
    status: 'Aktif',
  },
  {
    id: 4,
    nama: 'Hendra Gunawan',
    email: 'hendra.g@polibatam.ac.id',
    role: 'Pimpinan',
    unitInstansi: 'Direktur',
    status: 'Aktif',
  },
  {
    id: 5,
    nama: 'PT. Teknologi Maju',
    email: 'info@teknologimaju.co.id',
    role: 'Mitra',
    unitInstansi: 'Perusahaan Swasta',
    status: 'Aktif',
  },

];

const roleColor: Record<string, { bg: string; text: string }> = {
  Admin: { bg: 'bg-teal-500', text: 'text-white' },
  Jurusan: { bg: 'bg-blue-500', text: 'text-white' },
  Prodi: { bg: 'bg-orange-400', text: 'text-white' },
  Pimpinan: { bg: 'bg-red-500', text: 'text-white' },
  Mitra: { bg: 'bg-purple-500', text: 'text-white' },
};

const statusStyle: Record<string, { bg: string; text: string; dot: string }> = {
  Aktif: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  NonAktif: { bg: 'bg-gray-200', text: 'text-gray-600', dot: 'bg-gray-400' },
  Ditolak: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
};

export default function ManajemenUserPage() {
  const pageSize = 10;
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterRole, setFilterRole] = useState('Semua Role');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // Form state shared by add & edit
  const emptyForm = { nama: '', email: '', role: '' as string, unitInstansi: '', status: 'Aktif' as string, phone: '', username: '', password: '' };
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadUsers = async () => {
      try {
        setLoadError('');
        const result = await getAdminUsers();
        if (mounted) {
          setUsers(result);
          setIsFallback(false);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gagal memuat data user.';
        const isConnectivityError = /gagal terhubung|failed to fetch|network|load failed|fetch/i.test(message);

        if (mounted) {
          if (isConnectivityError) {
            console.warn('Backend tidak dapat diakses, menggunakan data fallback lokal.');
            setUsers(fallbackUsers);
            setIsFallback(true);
            setLoadError('');
          } else {
            setUsers([]);
            setIsFallback(false);
            setLoadError(message);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setIsReloading(false);
        }
      }
    };

    loadUsers();

    return () => {
      mounted = false;
    };
  }, []);

  const handleReload = async () => {
    setIsReloading(true);
    setLoadError('');
    try {
      const result = await getAdminUsers();
      setUsers(result);
      setIsFallback(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memuat data user.';
      const isConnectivityError = /gagal terhubung|failed to fetch|network|load failed|fetch/i.test(message);
      if (isConnectivityError) {
        setUsers(fallbackUsers);
        setIsFallback(true);
      } else {
        setLoadError(message);
        setIsFallback(false);
      }
    } finally {
      setIsReloading(false);
    }
  };

  const openAdd = () => {
    setForm(emptyForm);
    setFormErrors({});
    setServerError('');
    setShowAddModal(true);
  };

  const openEdit = (item: UserItem) => {
    setForm({ nama: item.nama, email: item.email, role: item.role, unitInstansi: item.unitInstansi, status: item.status, phone: '', username: '', password: '' });
    setEditUser(item);
    setFormErrors({});
    setServerError('');
  };

  const handleSaveAdd = async () => {
    const errors: Record<string, string> = {};
    if (!form.nama.trim()) errors.nama = 'Nama lengkap wajib diisi.';
    if (!form.username.trim()) errors.username = 'Username wajib diisi.';
    else if (form.username.trim().length < 4) errors.username = 'Username minimal 4 karakter.';
    if (!form.email.trim()) errors.email = 'Email wajib diisi.';
    if (!form.password) errors.password = 'Password wajib diisi.';
    else if (form.password.length < 8) errors.password = 'Password minimal 8 karakter.';
    if (!form.role) errors.role = 'Role wajib dipilih.';
    if (!form.unitInstansi.trim()) errors.unitInstansi = 'Unit/Instansi wajib diisi.';
    if (!form.phone.trim()) errors.phone = 'No. Telepon wajib diisi.';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setServerError('');
      setSubmitting(true);
      const newUser = await createAdminUser({
        nama: form.nama,
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role as UiRole,
        unitInstansi: form.unitInstansi,
        phone: form.phone,
      });

      setUsers((prev) => [newUser, ...prev]);
      setShowAddModal(false);
      setForm(emptyForm);
      setFormErrors({});
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Gagal menambahkan user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;

    const errors: Record<string, string> = {};
    if (!form.nama.trim()) errors.nama = 'Nama lengkap wajib diisi.';
    if (!form.email.trim()) errors.email = 'Email wajib diisi.';
    if (!form.role) errors.role = 'Role wajib dipilih.';
    if (!form.unitInstansi.trim()) errors.unitInstansi = 'Unit/Instansi wajib diisi.';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setServerError('');
      setSubmitting(true);
      const updatedUser = await updateAdminUser(editUser.id, {
        nama: form.nama,
        email: form.email,
        role: form.role as UiRole,
        unitInstansi: form.unitInstansi,
        status: form.status as UiStatus,
      });

      setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updatedUser : u)));
      setEditUser(null);
      setForm(emptyForm);
      setFormErrors({});
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Gagal mengubah user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const item = users.find((u) => u.id === id);
    if (!item) return;

    if (item.role === 'Admin' && users.filter((u) => u.role === 'Admin').length <= 1) {
      setDeleteError('Tidak dapat menghapus admin terakhir');
      return;
    }

    if (!confirm(`Yakin ingin menghapus user "${item.nama}"?`)) return;

    try {
      setSubmitting(true);
      setDeleteError('');
      await deleteAdminUser(id);
      setUsers((prev) => prev.filter((user) => user.id !== id));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Gagal menghapus user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: number) => {
    const currentUser = users.find((u) => u.id === id);
    if (!currentUser) return;

    const nextStatus: UiStatus = currentUser.status === 'Aktif' ? 'NonAktif' : 'Aktif';

    try {
      setSubmitting(true);
      const updated = await updateAdminUserStatus(id, nextStatus);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Gagal mengubah status user.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = users.filter((item) => {
    const matchRole =
      filterRole === 'Semua Role' || item.role === filterRole;
    const matchSearch =
      item.nama.toLowerCase().includes(search.toLowerCase()) ||
      item.email.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedUsers = filtered.slice(startIndex, startIndex + pageSize);

  const paginationItems: Array<number | 'ellipsis'> = (() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
    }

    if (currentPage >= totalPages - 3) {
      return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
  })();

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterRole]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const totalUser = users.length;
  const totalAdmin = users.filter((u) => u.role === 'Admin').length;
  const totalJurusan = users.filter((u) => u.role === 'Jurusan').length;
  const totalProdi = users.filter((u) => u.role === 'Prodi').length;
  const totalPimpinan = users.filter((u) => u.role === 'Pimpinan').length;
  const totalMitra = users.filter((u) => u.role === 'Mitra').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Manajemen User</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Kelola user dan hak akses sistem
          </p>
        </div>
        <button
          onClick={openAdd}
          disabled={submitting}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus size={14} />
          Tambah User
        </button>
      </div>

      {/* Summary Cards */}
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {loadError}
        </div>
      )}

      {deleteError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <span className="font-medium">Gagal:</span>
            <span>{deleteError}</span>
          </div>
          <button
            type="button"
            onClick={() => setDeleteError('')}
            className="shrink-0 rounded p-0.5 hover:bg-red-100"
          >
            <X size={14} className="text-red-500" />
          </button>
        </div>
      )}

      {isFallback && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2.5 text-[12px] text-amber-800">
            <ClockAlert size={16} className="shrink-0 text-amber-500" />
            <span>Menampilkan <span className="font-semibold">data lokal (lama)</span> — server tidak dapat dijangkau saat ini.</span>
          </div>
          <button
            type="button"
            onClick={handleReload}
            disabled={isReloading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[10px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
          >
            <RefreshCw size={13} className={isReloading ? 'animate-spin' : ''} />
            {isReloading ? 'Memuat...' : 'Tinjau Data Terbaru'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-blue-100 flex items-center justify-center">
              <Users size={14} className="text-blue-600" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Total User</p>
          </div>
          <p className="text-[17px] font-bold text-gray-900">{totalUser}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-teal-100 flex items-center justify-center">
              <Shield size={14} className="text-teal-600" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Admin</p>
          </div>
          <p className="text-[17px] font-bold text-gray-900">{totalAdmin}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-blue-100 flex items-center justify-center">
              <Building2 size={14} className="text-blue-600" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Jurusan</p>
          </div>
          <p className="text-[17px] font-bold text-gray-900">{totalJurusan}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-orange-100 flex items-center justify-center">
              <GraduationCap size={14} className="text-orange-600" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Prodi</p>
          </div>
          <p className="text-[17px] font-bold text-gray-900">{totalProdi}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-red-100 flex items-center justify-center">
              <UserCheck size={14} className="text-red-600" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Pimpinan</p>
          </div>
          <p className="text-[17px] font-bold text-gray-900">{totalPimpinan}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-purple-100 flex items-center justify-center">
              <Handshake size={14} className="text-purple-600" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Mitra</p>
          </div>
          <p className="text-[17px] font-bold text-gray-900">{totalMitra}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Cari akun..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full pl-9 pr-4 py-2.5 text-[12px]"
          />
        </div>

        <div className="relative">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="input-field appearance-none pl-4 pr-9 py-2.5 text-[12px] font-medium"
          >
            <option>Semua Role</option>
            <option>Admin</option>
            <option>Jurusan</option>
            <option>Prodi</option>
            <option>Pimpinan</option>
            <option>Mitra</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="table-head border-b border-gray-200">
                <th className="text-left py-3.5 px-4 font-semibold text-gray-700">
                  Nama
                </th>
                <th className="text-left py-3.5 px-4 font-semibold text-gray-700">
                  Email
                </th>
                <th className="text-left py-3.5 px-4 font-semibold text-gray-700">
                  Role
                </th>
                <th className="text-left py-3.5 px-4 font-semibold text-gray-700">
                  Unit/Instansi
                </th>
                <th className="text-left py-3.5 px-4 font-semibold text-gray-700">
                  Status
                </th>
                <th className="text-left py-3.5 px-4 font-semibold text-gray-700">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-gray-500"
                  >
                    Memuat data user...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-gray-400"
                  >
                    Tidak ada data ditemukan
                  </td>
                </tr>
              )}

              {!loading && paginatedUsers.map((item) => {
                const rc = roleColor[item.role];
                const sc = statusStyle[item.status];
                return (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50 transition"
                  >
                    <td className="py-3.5 px-4 font-medium text-gray-900">
                      {item.nama}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">
                      {item.email}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-semibold min-w-[70px] ${rc.bg} ${rc.text}`}
                      >
                        {item.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        {item.unitInstansi}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleStatus(item.id)}
                        disabled={submitting}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold cursor-pointer transition hover:opacity-80 ${sc.bg} ${sc.text}`}
                        title="Klik untuk ubah status"
                      >
                        <UserCheck size={12} />
                        {item.status}
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          disabled={submitting}
                          className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition"
                          title="Edit User"
                        >
                          <Pencil size={14} className="text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={submitting}
                          className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition"
                          title="Hapus User"
                        >
                          <Trash2 size={14} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-white">
            <p className="text-[10px] text-gray-500">
              Menampilkan {startIndex + 1}-{Math.min(startIndex + pageSize, filtered.length)} dari {filtered.length} user
            </p>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-[10px] font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sebelumnya
              </button>

              {paginationItems.map((item, index) => {
                if (item === 'ellipsis') {
                  return (
                    <span
                      key={`ellipsis-${index}`}
                      className="px-1.5 text-[10px] font-semibold text-gray-500"
                    >
                      ...
                    </span>
                  );
                }

                const isActive = item === currentPage;
                return (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    className={`min-w-8 px-2.5 py-1.5 text-[10px] font-semibold rounded-md border transition ${
                      isActive
                        ? 'bg-[#0e1d34] border-[#0e1d34] text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-[10px] font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-[15px] font-bold text-gray-900 mb-4">
              Tambah User Baru
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nama}
                    onChange={(e) => { setForm({ ...form, nama: e.target.value }); setFormErrors((p) => ({ ...p, nama: '' })); }}
                    className={`w-full border ${formErrors.nama ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    placeholder="Masukkan nama lengkap"
                  />
                  {formErrors.nama && <p className="text-red-500 text-[10px] mt-1">{formErrors.nama}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => { setForm({ ...form, username: e.target.value }); setFormErrors((p) => ({ ...p, username: '' })); }}
                    className={`w-full border ${formErrors.username ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    placeholder="Masukkan username"
                  />
                  {formErrors.username && <p className="text-red-500 text-[10px] mt-1">{formErrors.username}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); setFormErrors((p) => ({ ...p, email: '' })); }}
                    className={`w-full border ${formErrors.email ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    placeholder="contoh@polibatam.ac.id"
                  />
                  {formErrors.email && <p className="text-red-500 text-[10px] mt-1">{formErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => { setForm({ ...form, password: e.target.value }); setFormErrors((p) => ({ ...p, password: '' })); }}
                    className={`w-full border ${formErrors.password ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    placeholder="Min. 8 karakter"
                  />
                  {formErrors.password && <p className="text-red-500 text-[10px] mt-1">{formErrors.password}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.role}
                      onChange={(e) => { setForm({ ...form, role: e.target.value }); setFormErrors((p) => ({ ...p, role: '' })); }}
                      className={`appearance-none w-full border ${formErrors.role ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    >
                      <option value="">Pilih Role</option>
                      <option value="Admin">Admin</option>
                      <option value="Jurusan">Jurusan</option>
                      <option value="Prodi">Prodi</option>
                      <option value="Pimpinan">Pimpinan</option>
                      <option value="Mitra">Mitra</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                  </div>
                  {formErrors.role && <p className="text-red-500 text-[10px] mt-1">{formErrors.role}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Unit/Instansi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.unitInstansi}
                    onChange={(e) => { setForm({ ...form, unitInstansi: e.target.value }); setFormErrors((p) => ({ ...p, unitInstansi: '' })); }}
                    className={`w-full border ${formErrors.unitInstansi ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    placeholder="Nama unit/instansi"
                  />
                  {formErrors.unitInstansi && <p className="text-red-500 text-[10px] mt-1">{formErrors.unitInstansi}</p>}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                  No. Telepon / WhatsApp <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFormErrors((p) => ({ ...p, phone: '' })); }}
                  className={`w-full border ${formErrors.phone ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                  placeholder="Contoh: 08123456789"
                />
                {formErrors.phone && <p className="text-red-500 text-[10px] mt-1">{formErrors.phone}</p>}
              </div>
            </div>

            {serverError && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
                {serverError}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                disabled={submitting}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-[12px] font-medium hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleSaveAdd}
                disabled={submitting}
                className="px-4 py-2.5 bg-[#0e1d34] hover:bg-[#1a2d4a] text-white rounded-lg text-[12px] font-medium transition"
              >
                {submitting ? 'Menyimpan...' : 'Simpan User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-[15px] font-bold text-gray-900 mb-4">
              Edit User — {editUser.nama}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Nama Lengkap</label>
                  <input type="text" value={form.nama} onChange={(e) => { setForm({ ...form, nama: e.target.value }); setFormErrors((p) => ({ ...p, nama: '' })); }} className={`w-full border ${formErrors.nama ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`} />
                  {formErrors.nama && <p className="text-red-500 text-[10px] mt-1">{formErrors.nama}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setFormErrors((p) => ({ ...p, email: '' })); }} className={`w-full border ${formErrors.email ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`} />
                  {formErrors.email && <p className="text-red-500 text-[10px] mt-1">{formErrors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Role</label>
                  <div className="relative">
                    <select value={form.role} onChange={(e) => { setForm({ ...form, role: e.target.value }); setFormErrors((p) => ({ ...p, role: '' })); }} className={`appearance-none w-full border ${formErrors.role ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`}>
                      <option value="Admin">Admin</option>
                      <option value="Jurusan">Jurusan</option>
                      <option value="Prodi">Prodi</option>
                      <option value="Pimpinan">Pimpinan</option>
                      <option value="Mitra">Mitra</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {formErrors.role && <p className="text-red-500 text-[10px] mt-1">{formErrors.role}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Unit/Instansi</label>
                  <input type="text" value={form.unitInstansi} onChange={(e) => { setForm({ ...form, unitInstansi: e.target.value }); setFormErrors((p) => ({ ...p, unitInstansi: '' })); }} className={`w-full border ${formErrors.unitInstansi ? 'border-red-400' : 'border-gray-300'} rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white`} />
                  {formErrors.unitInstansi && <p className="text-red-500 text-[10px] mt-1">{formErrors.unitInstansi}</p>}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Status</label>
                <div className="relative">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="appearance-none w-full border border-gray-300 rounded-lg px-4 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="Aktif">Aktif</option>
                    <option value="NonAktif">NonAktif</option>
                    <option value="Ditolak">Ditolak</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {serverError && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
                {serverError}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditUser(null)} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-[12px] font-medium hover:bg-gray-50">
                Batal
              </button>
              <button onClick={handleSaveEdit} disabled={submitting} className="px-4 py-2.5 bg-[#0e1d34] hover:bg-[#1a2d4a] text-white rounded-lg text-[12px] font-medium transition">
                {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
