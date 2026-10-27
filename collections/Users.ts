import type { Access, CollectionConfig, FieldAccess } from 'payload'

type Role = { role?: 'admin' | 'maestro' }

const isAdmin: Access = ({ req: { user } }) => (user as Role | null)?.role === 'admin'

const ownProfile: Access = ({ req: { user } }) =>
  (user as Role | null)?.role === 'admin' ? true : { id: { equals: user?.id ?? 0 } }

const adminOnlyField: FieldAccess = ({ req: { user } }) =>
  (user as Role | null)?.role === 'admin'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Maestro', plural: 'Maestros' },
  auth: true,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
  },
  access: {
    read: ownProfile,
    create: isAdmin,
    update: ownProfile,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // The first account created in the panel is the administrator.
        if (operation === 'create') {
          const { totalDocs } = await req.payload.count({ collection: 'users' })
          if (totalDocs === 0) data.role = 'admin'
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', label: 'Nombre', required: true },
    {
      name: 'role',
      type: 'select',
      label: 'Rol',
      required: true,
      defaultValue: 'maestro',
      options: [
        { label: 'Administrador', value: 'admin' },
        { label: 'Maestro', value: 'maestro' },
      ],
      access: {
        // Only an admin can grant roles; a teacher cannot promote themselves.
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
  ],
}
