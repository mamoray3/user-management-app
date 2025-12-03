import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome, {session.user?.name || 'User'}
        </h1>
        <p className="text-gray-600 mb-6">
          This is the User Management System. You can manage users, approve new registrations, and update user information.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/users" className="block">
            <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-md transition-all">
              <h3 className="font-semibold text-gray-900 mb-2">View Users</h3>
              <p className="text-sm text-gray-500">Browse and search all users in the system</p>
            </div>
          </Link>

          <Link href="/files" className="block">
            <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-md transition-all">
              <h3 className="font-semibold text-gray-900 mb-2">My Files</h3>
              <p className="text-sm text-gray-500">Browse your S3 files via Access Grants</p>
            </div>
          </Link>

          {session.user?.role === 'admin' && (
            <>
              <Link href="/users/new" className="block">
                <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-md transition-all">
                  <h3 className="font-semibold text-gray-900 mb-2">Add New User</h3>
                  <p className="text-sm text-gray-500">Create a new user account</p>
                </div>
              </Link>

              <Link href="/users?filter=pending" className="block">
                <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-md transition-all">
                  <h3 className="font-semibold text-gray-900 mb-2">Pending Approvals</h3>
                  <p className="text-sm text-gray-500">Review and approve pending users</p>
                </div>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Profile</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Email</dt>
            <dd className="text-sm text-gray-900">{session.user?.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Role</dt>
            <dd className="text-sm text-gray-900 capitalize">{session.user?.role || 'User'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
