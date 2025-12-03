import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL;

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/users/${params.id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        approvedBy: session.user.email,
        approvedAt: new Date().toISOString(),
      }),
    });

    if (response.status === 404) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to approve user');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error approving user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve user' },
      { status: 500 }
    );
  }
}
