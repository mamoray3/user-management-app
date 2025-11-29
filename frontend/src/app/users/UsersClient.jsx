'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function UsersClient({ initialUsers, error, isAdmin, currentFilter }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState(null);
  const [isApproving, setIsApproving] = useState(null);

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setIsDeleting(userId);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setUsers(users.filter(u => u.id !== userId));
      } else {
        alert('Failed to delete user');
      }
    } catch (err) {
      alert('An error occurred while deleting the user');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleApprove = async (userId) => {
    setIsApproving(userId);
    try {
      const response = await fetch(`/api/users/${userId}/approve`, {
        method: 'POST',
      });

      if (response.ok) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, status: 'active' } : u
        ));
      } else {
        alert('Failed to approve user');
      }
    } catch (err) {
      alert('An error occurred while approving the user');
    } finally {
      setIsApproving(null);
    }
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      active: 'badge-active',
      pending: 'badge-pending',
      inactive: 'badge-inactive',
    };
    return `badge ${statusClasses[status] || 'badge-inactive'}`;
  };

  const getRoleBadge = (role) => {
    return role === 'admin' ? 'badge badge-admin' : 'badge badge-user';
  };

  const handleFilterChange = (filter) => {
    const url = filter ? `/users?filter=${filter}` : '/users';
    router.push(url);
  };

  if (error) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">Error loading users: {error}</p>
          <button 
            onClick={() => router.refresh()} 
            className="btn btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search users by name or email..."
              className="input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => handleFilterChange(null)}
                className={`btn ${!currentFilter ? 'btn-primary' : 'btn-secondary'}`}
              >
                All
              </button>
              <button
                onClick={() => handleFilterChange('pending')}
                className={`btn ${currentFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Pending
              </button>
              <button
                onClick={() => handleFilterChange('active')}
                className={`btn ${currentFilter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Active
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium">{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={getRoleBadge(user.role)}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={getStatusBadge(user.status)}>
                      {user.status}
                    </span>
                  </td>
                  <td className="text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right space-x-2">
                    <Link
                      href={`/users/${user.id}`}
                      className="text-primary-600 hover:text-primary-800"
                    >
                      View
                    </Link>
                    
                    {isAdmin && (
                      <>
                        {user.status === 'pending' && (
                          <button
                            onClick={() => handleApprove(user.id)}
                            disabled={isApproving === user.id}
                            className="text-green-600 hover:text-green-800 ml-2"
                          >
                            {isApproving === user.id ? 'Approving...' : 'Approve'}
                          </button>
                        )}
                        
                        <Link
                          href={`/users/${user.id}/edit`}
                          className="text-primary-600 hover:text-primary-800 ml-2"
                        >
                          Edit
                        </Link>
                        
                        <button
                          onClick={() => handleDelete(user.id)}
                          disabled={isDeleting === user.id}
                          className="text-red-600 hover:text-red-800 ml-2"
                        >
                          {isDeleting === user.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
