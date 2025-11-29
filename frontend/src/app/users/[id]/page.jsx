import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';

async function getUser(userId, session) {
  try {
    const baseUrl = process.env.API_BASE_URL;
    const response = await fetch(`${baseUrl}/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}

export default async function UserDetailPage({ params }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const user = await getUser(params.id, session);

  if (!user) {
    notFound();
  }

  const isAdmin = session.user?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-sm text-gray-500 mb-2">
            <Link href="/users" className="hover:text-primary-600">Users</Link>
            <span className="mx-2">/</span>
            <span>{user.name}</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
        </div>
        
        {isAdmin && (
          <div className="flex gap-2">
            <Link href={`/users/${user.id}/edit`} className="btn btn-primary">
              Edit User
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Information</h2>
          
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Full Name</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.name}</dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Email Address</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Role</dt>
              <dd className="mt-1">
                <span className={`badge ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>
                  {user.role}
                </span>
              </dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <span className={`badge badge-${user.status}`}>
                  {user.status}
                </span>
              </dd>
            </div>

            {user.department && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Department</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.department}</dd>
              </div>
            )}

            {user.phone && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Phone</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.phone}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Activity Card */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>
          
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(user.createdAt).toLocaleString()}
              </dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(user.updatedAt).toLocaleString()}
              </dd>
            </div>

            {user.lastLogin && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Login</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(user.lastLogin).toLocaleString()}
                </dd>
              </div>
            )}

            {user.approvedBy && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Approved By</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.approvedBy}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Back Link */}
      <div>
        <Link href="/users" className="text-primary-600 hover:text-primary-800">
          ← Back to Users
        </Link>
      </div>
    </div>
  );
}
