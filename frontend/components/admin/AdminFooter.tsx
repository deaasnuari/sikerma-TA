'use client';

import Image from 'next/image';
import { MapPin, Phone, Mail, Settings, HelpCircle, FileText } from 'lucide-react';

export default function AdminFooter() {
  return (
    <footer className="bg-[#091222] text-white shadow-lg rounded-lg">
      <div className="px-3 py-3 md:px-[0.72rem] md:py-[0.72rem]">
        <div className="max-w-full mx-auto">
          {/* Main Content — tumpuk vertikal di HP, 2 kolom mulai dari sm ke atas */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-[0.36rem] mb-3 sm:mb-[0.36rem]">
            {/* Company Info - Left */}
            <div className="flex-1 w-full sm:w-auto">
              <div className="flex items-center gap-[0.27rem] mb-[0.27rem]">
                <Image src="/polibatam_logo.png" alt="Logo Polibatam" width={48} height={48} quality={75} className="w-5 h-5 sm:w-[1.44rem] sm:h-[1.44rem] object-contain flex-shrink-0" />
                <p className="text-[11px] sm:text-[9.5px] font-bold">SIKERMA POLIBATAM</p>
              </div>
              <p className="text-[11px] sm:text-[9.5px] text-slate-300 leading-relaxed mb-[0.27rem]">
                Sistem Informasi Kerjasama Politeknik Negeri Batam
              </p>
              <div className="flex gap-3 sm:gap-[0.27rem]">
                <a href="#" className="inline-flex p-2 text-slate-400 hover:text-white transition-colors" title="Dokumentasi" aria-label="Dokumentasi">
                  <FileText size={13} className="sm:hidden" />
                  <FileText size={10} className="hidden sm:block" />
                </a>
                <a href="#" className="inline-flex p-2 text-slate-400 hover:text-white transition-colors" title="Bantuan" aria-label="Bantuan">
                  <HelpCircle size={13} className="sm:hidden" />
                  <HelpCircle size={10} className="hidden sm:block" />
                </a>
                <a href="#" className="inline-flex p-2 text-slate-400 hover:text-white transition-colors" title="Pengaturan" aria-label="Pengaturan">
                  <Settings size={13} className="sm:hidden" />
                  <Settings size={10} className="hidden sm:block" />
                </a>
              </div>
            </div>

            {/* Contact Info — rata kiri & icon-di-depan di HP, balik rata kanan di sm+ */}
            <div className="flex-shrink-0 w-full sm:w-auto text-left sm:text-right">
              <p className="text-[11px] sm:text-[9.5px] font-bold mb-[0.27rem]">Kontak</p>
              <ul className="space-y-1.5 sm:space-y-[0.18rem]">
                <li className="flex items-start gap-1.5 sm:gap-[0.18rem] text-[11px] sm:text-[9.5px] justify-start sm:justify-end">
                  <MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0 sm:hidden" />
                  <span className="text-slate-300 break-words">Jl. Ahmad Yani, Batam Kota, Kota Batam, Kepulauan Riau, Indonesia</span>
                  <MapPin size={9} className="text-slate-400 mt-0.5 flex-shrink-0 hidden sm:block" />
                </li>
                <li className="flex items-center gap-1.5 sm:gap-[0.18rem] text-[11px] sm:text-[9.5px] justify-start sm:justify-end">
                  <Phone size={12} className="text-slate-400 flex-shrink-0 sm:hidden" />
                  <a href="tel:+62-778-469829" className="inline-flex min-h-[24px] items-center text-slate-300 hover:text-white transition-colors">+62-778-469858 Ext.1017</a>
                  <Phone size={9} className="text-slate-400 flex-shrink-0 hidden sm:block" />
                </li>
                <li className="flex items-start gap-1.5 sm:gap-[0.18rem] text-[11px] sm:text-[9.5px] justify-start sm:justify-end">
                  <Mail size={12} className="text-slate-400 mt-0.5 flex-shrink-0 sm:hidden" />
                  <a href="mailto:info@polibatam.ac.id" className="inline-flex min-h-[24px] items-center text-slate-300 hover:text-white transition-colors break-words">oia@polibatam.ac.id atau kerjasama@polibatam.ac.id</a>
                  <Mail size={9} className="text-slate-400 flex-shrink-0 hidden sm:block" />
                </li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-700/60 my-[0.27rem]"></div>

          {/* Bottom */}
          <div className="flex justify-center items-center text-[10px] sm:text-[9.5px] text-slate-400 text-center">
            <p>2026 SIKERMA Polibatam</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
