<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            MasterUnitProdiSeeder::class,
            MasterRuangLingkupSeeder::class,
            MasterMitraSeeder::class,
            MasterNegaraSeeder::class,
            DummyDataSeeder::class,
        ]);

        $users = [
            [
                'name' => 'Admin Sikerma',
                'username' => 'admin.sikerma',
                'email' => 'admin@polibatam.ac.id',
                'role' => 'admin',
                'approval_status' => 'active',
                'password' => Hash::make('Sikerma#2026'),
            ],
            [
                'name' => 'Pimpinan Polibatam',
                'username' => 'pimpinan.polibatam',
                'email' => 'pimpinan@polibatam.ac.id',
                'role' => 'pimpinan',
                'approval_status' => 'active',
                'password' => Hash::make('Sikerma#2026'),
            ],
            [
                'name' => 'User Internal',
                'username' => 'internal.polibatam',
                'email' => 'internal@polibatam.ac.id',
                'role' => 'internal',
                'approval_status' => 'active',
                'password' => Hash::make('Sikerma#2026'),
            ],
            [
                'name' => 'Mitra Eksternal',
                'username' => 'mitra.eksternal',
                'email' => 'external@mitra.com',
                'role' => 'external',
                'approval_status' => 'active',
                'password' => Hash::make('Sikerma#2026'),
            ],
        ];

        foreach ($users as $user) {
            User::updateOrCreate(
                ['email' => $user['email']],
                $user,
            );
        }
    }
}
