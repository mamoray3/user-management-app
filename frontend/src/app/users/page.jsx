import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import UsersClient from './UsersClient';

async function getUsers(session, filter) {
  try {
    const baseUrl = process.env.API_BASE_URL;
    const url = filter 
      ? `${baseUrl}/users?status=${filter}` 
      : `${baseUrl}/users`;
    
    console.log('API_BASE_URL:', baseUrl);
    console.log('Fetching URL:', url);
    console.log('Has accessToken:', !!session.accessToken);
    console.log('Token preview:', session.accessToken?.substring(0, 50) + '...');
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`Failed to fetch users: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching users:', error);
    return { users: [], error: error.message };
  }
}

export default async function UsersPage({ searchParams }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const filter = searchParams?.filter || null;
  const data = await getUsers(session, filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">
            {filter === 'pending' 
              ? 'Users pending approval' 
              : 'Manage all users in the system'}
          </p>
        </div>
        
        {session.user?.role === 'admin' && (
          <a href="/users/new" className="btn btn-primary">
            Add New User
          </a>
        )}
      </div>

      <UsersClient 
        initialUsers={data.users || []} 
        error={data.error}
        isAdmin={session.user?.role === 'admin'}
        currentFilter={filter}
      />
    </div>
  );
}
