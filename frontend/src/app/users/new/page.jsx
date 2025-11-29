import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import UserForm from '@/components/UserForm';

export default async function NewUserPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Only admins can create users
  if (session.user?.role !== 'admin') {
    redirect('/users');
  }

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/users" className="hover:text-primary-600">Users</Link>
          <span className="mx-2">/</span>
          <span>New User</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">Create New User</h1>
        <p className="text-gray-600">Add a new user to the system</p>
      </div>

      <div className="card max-w-2xl">
        <UserForm isEdit={false} />
      </div>
    </div>
  );
}
