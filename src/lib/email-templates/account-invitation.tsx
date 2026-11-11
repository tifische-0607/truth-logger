import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { main, container, h1, text, button, footer } from './brand'

interface Props { name?: string; levelLabel?: string; link?: string; expires?: string }

const AccountInvitation = ({ name, levelLabel, link, expires }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your FA Portal invitation</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Welcome, ${name}` : 'Welcome to FA Portal'}</Heading>
        <Text style={text}>You have been invited to FA Portal{levelLabel ? ` as ${levelLabel}` : ''}. Open the link below to set your own password.</Text>
        {link ? <Button style={button} href={link}>Accept invitation</Button> : null}
        <Text style={footer}>This link works once{expires ? ` and expires on ${expires}` : ''}. If you were not expecting it, ignore this email.</Text>
        <Text style={footer}>Produced by FridayAnalytics.org</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountInvitation,
  subject: 'Your FA Portal invitation',
  displayName: 'Account invitation',
  previewData: { name: 'Jane', levelLabel: 'FA Staff', link: 'https://portal.fridayanalytics.org/invite?token=sample', expires: '18 Nov 2026' },
} satisfies TemplateEntry
