import { Link } from 'react-router-dom'

// Markup and classes from solidarity-site/about.html. Copy is the prototype's,
// except where the 22 September decisions changed the facts (marked below):
// the name, how writers get accounts, who can read a letter, and recovery.
export default function About() {
  return (
    <div className="static-page">
      <div className="static-inner">
        <p className="static-eyebrow">About this site</p>
        <h1 className="static-title">letters.support</h1>
        <div className="static-title-rule"></div>

        <div className="static-section">
          <h2 className="static-section-heading">What this is</h2>
          <div className="static-body">
            <p>
              letters.support is a correspondence platform for political prisoner support. It serves two purposes: a
              public directory of political prisoners, the facilities holding them, and the groups supporting them; and a
              private platform through which letter writers can correspond with prisoners via support group relays.
            </p>
            <p>
              The public directory is maintained by network administrators, with edits and corrections submitted by
              member groups. Anyone can browse it — no account required.
            </p>
            {/* Changed: writers join with an invite code from a group (22 Sept). */}
            <p>
              The correspondence platform is for writers with accounts. You join with an invite code from a member
              group, or a group can set up an account for you that you later claim as your own. Letters are end-to-end
              encrypted and never stored in plaintext on the server.
            </p>
          </div>
        </div>

        <div className="static-section">
          <h2 className="static-section-heading">How the relay network works</h2>
          <div className="static-body">
            <p>
              Mailing letters internationally is expensive and unreliable. A letter sent from the United States to a
              prison in Belarus may cost several dollars in postage, take weeks, and arrive damaged or not at all. The
              relay network addresses this by routing letters through local groups closer to the destination.
            </p>
            <p>
              When a writer submits a letter through this site, it goes into a queue for their relay group — a local ABC
              chapter that handles printing and physical mailing. If the prisoner is in another country, that group may
              forward the letter to a partner group closer to the facility, who then handles the final mailing locally.
            </p>
            <p>
              Every group in the network can relay to every other group. There is no fixed hierarchy — just a web of
              mutual support between chapters.
            </p>
          </div>
        </div>

        <div className="static-section">
          <h2 className="static-section-heading">Encryption</h2>
          <div className="static-body">
            {/* Changed: says plainly that the printing group can read the letter (22 Sept). */}
            <p>
              Letters are encrypted in your browser before they leave your device. The server receives and stores only
              ciphertext — scrambled data that is unreadable without a key. Your password never leaves your device.
            </p>
            <p>
              A letter can be read by you and by the group that prints and mails it, because someone has to print it.
              Within that group, only the volunteers who hold the group's key can read it, and groups are asked to keep
              that circle small. Nobody else can: not the people who run the server, and not anyone who seizes or
              subpoenas it.
            </p>
          </div>
          {/* Changed: recovery codes exist; decided wording (22 Sept). */}
          <div className="static-callout">
            <strong>Important:</strong> When you make an account, you are shown a recovery code. Keep it somewhere safe:
            it is the only way back in if you forget your password. If a group made your account for you and you have not
            claimed it yet, ask them for a new claim code. If you lose both your password and your recovery code, your
            letters cannot be recovered by anyone — not your group, not us.
          </div>
          <div className="static-body">
            <p>
              Note that this protects the content of letters in transit and at rest on the server. It does not protect
              the fact of correspondence itself, which is visible to prison staff when mail arrives, nor metadata such as
              who is corresponding with whom, which is stored unencrypted to allow the site to function.
            </p>
          </div>
        </div>

        <hr className="static-divider" />

        <div className="static-section">
          <h2 className="static-section-heading">How groups join</h2>
          <div className="static-body">
            <p>
              Access for support groups is invitation-only. New groups are brought into the network by existing member
              groups through a personal vouching process that happens off this platform. There is no self-registration.
            </p>
            <p>If your group wants to join the network, reach out to an existing member chapter in your area or region.</p>
          </div>
        </div>

        <div className="static-section">
          <h2 className="static-section-heading">How to get involved as an individual</h2>
          <div className="static-body">
            <p>
              You do not need an account to write letters. Browse the <Link to="/prisoners">prisoner directory</Link>,
              find a prisoner you want to write to, read their facility's mail rules, and write a letter. Find a{' '}
              <Link to="/groups">support group</Link> near you that mails to that prisoner, and bring your letter to one
              of their events.
            </p>
            {/* Changed: invite codes instead of group-created accounts (22 Sept). */}
            <p>
              If you want to correspond regularly and have your letters tracked through this platform, ask the group
              running your local letter writing night for an invite code.
            </p>
          </div>
        </div>

        <hr className="static-divider" />

        <div className="static-section">
          <h2 className="static-section-heading">The Anarchist Black Cross</h2>
          <div className="static-body">
            <p>
              The Anarchist Black Cross is a network of autonomous groups providing support to political prisoners
              worldwide. Chapters operate independently in dozens of countries. This platform is a tool built for use by
              ABC chapters and allied groups — it is not a central organization and does not speak for any chapter or the
              network as a whole.
            </p>
            <p>
              For more information about the ABC network, visit{' '}
              <a href="https://www.abcf.net/" target="_blank" rel="noopener noreferrer">
                abcf.net
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
