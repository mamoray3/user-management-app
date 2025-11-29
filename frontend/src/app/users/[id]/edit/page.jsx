import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import UserForm from '@/components/UserForm';

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

export default async function EditUserPage({ params }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Only admins can edit users
  if (session.user?.role !== 'admin') {
    redirect('/users');
  }

  const user = await getUser(params.id, session);

  if (!user) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/users" className="hover:text-primary-600">Users</Link>
          <span className="mx-2">/</span>
          <Link href={`/users/${user.id}`} className="hover:text-primary-600">{user.name}</Link>
          <span className="mx-2">/</span>
          <span>Edit</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
        <p className="text-gray-600">Update user information</p>
      </div>

      <div className="card max-w-2xl">
        <UserForm user={user} isEdit={true} />
      </div>
    </div>
  );
}
