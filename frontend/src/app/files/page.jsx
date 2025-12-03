import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import FileBrowser from '@/components/FileBrowser';

export default async function FilesPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          My Files
        </h1>
        <p className="text-gray-600 mb-6">
          Browse and manage your files stored in S3. Access is controlled via S3 Access Grants based on your identity.
        </p>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Session Info</h3>
          <dl className="text-sm text-blue-700 space-y-1">
            <div className="flex">
              <dt className="font-medium w-32">User:</dt>
              <dd>{session.user?.email}</dd>
            </div>
            <div className="flex">
              <dt className="font-medium w-32">IDC User ID:</dt>
              <dd className="font-mono text-xs">{session.user?.idcUserId || 'Not available'}</dd>
            </div>
            <div className="flex">
              <dt className="font-medium w-32">S3 Prefix:</dt>
              <dd className="font-mono text-xs">{session.user?.s3Prefix || 'Not available'}</dd>
            </div>
          </dl>
        </div>

        <FileBrowser />
      </div>
    </div>
  );
}
