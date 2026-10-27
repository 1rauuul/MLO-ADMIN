import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
}

export default withPayload(nextConfig)
