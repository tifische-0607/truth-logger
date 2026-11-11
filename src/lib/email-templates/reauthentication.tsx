import { main, container, h1, text, button, footer, link, codeStyle, darkModeCss } from './brand'
import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={text}><strong>FridayAnalytics · FA Portal</strong></Text>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
        <Text style={footer}>Produced by FridayAnalytics.org<br />Friday Analytics Sdn. Bhd.<br />Company Reg. No. 202601040549 (1702644-K)<br />www.fridayanalytics.org</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
