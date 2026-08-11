'use client';

import { MapPin, Phone, Mail, Settings, HelpCircle, FileText } from 'lucide-react';

export default function AdminFooter() {
  return (
    <footer className="bg-[#091222] text-white shadow-lg rounded-lg">
      <div className="px-[0.54rem] md:px-[0.72rem] py-[0.54rem] md:py-[0.72rem]">
        <div className="max-w-full mx-auto">
          {/* Main Content */}
          <div className="flex justify-between items-start gap-[0.36rem] mb-[0.36rem]">
            {/* Company Info - Left */}
            <div className="flex-1">
              <div className="flex items-center gap-[0.27rem] mb-[0.27rem]">
                <img src="/polibatam_logo.png" alt="Logo Polibatam" className="w-[1.44rem] h-[1.44rem] object-contain flex-shrink-0" />
                <h3 className="text-[9.5px] font-bold">SIKERMA POLIBATAM</h3>
              </div>
              <p className="text-[9.5px] text-slate-300 leading-relaxed mb-[0.27rem]">
                Sistem Informasi Kerjasama Politeknik Negeri Batam
              </p>
              <div className="flex gap-[0.27rem]">
                <a href="#" className="text-slate-400 hover:text-white transition-colors" title="Dokumentasi">
                  <FileText size={10} />
                </a>
                <a href="#" className="text-slate-400 hover:text-white transition-colors" title="Bantuan">
                  <HelpCircle size={10} />
                </a>
                <a href="#" className="text-slate-400 hover:text-white transition-colors" title="Pengaturan">
                  <Settings size={10} />
                </a>
              </div>
            </div>

            {/* Contact Info - Right */}
            <div className="flex-shrink-0 text-right">
              <h4 className="text-[9.5px] font-bold mb-[0.27rem]">Kontak</h4>
              <ul className="space-y-[0.18rem]">
                <li className="flex items-start gap-[0.18rem] text-[9.5px] justify-end">
                  <span className="text-slate-300">Jl. Ahmad Yani, Batam Kota, Kota Batam, Kepulauan Riau, Indonesia</span>
                  <MapPin size={9} className="text-slate-400 mt-0.5 flex-shrink-0" />
                </li>
                <li className="flex items-center gap-[0.18rem] text-[9.5px] justify-end">
                  <a href="tel:+62-778-469829" className="text-slate-300 hover:text-white transition-colors">+62-778-469858 Ext.1017</a>
                  <Phone size={9} className="text-slate-400 flex-shrink-0" />
                </li>
                <li className="flex items-center gap-[0.18rem] text-[9.5px] justify-end">
                  <a href="mailto:info@polibatam.ac.id" className="text-slate-300 hover:text-white transition-colors"> oia@polibatam.ac.id atau kerjasama@polibatam.ac.id </a>
                  <Mail size={9} className="text-slate-400 flex-shrink-0" />
                </li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-700/60 my-[0.27rem]"></div>

          {/* Bottom */}
          <div className="flex justify-center items-center text-[9.5px] text-slate-400">
            <p>2026 SIKERMA Polibatam</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
