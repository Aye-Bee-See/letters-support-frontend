import { Link } from 'react-router-dom'

// Markup and classes from solidarity-site/about.html. Copy is the prototype's,
// except where the 22 September decisions changed the facts (marked below):
// the name, how writers get accounts, who can read a letter, and recovery.
export default function About() {
  return (
    <div className="static-page">
      <title>About · Paper Kites</title>
      <div className="static-inner">
        <p className="static-eyebrow">About this site</p>
        <h1 className="static-title">Paper Kites</h1>
        <div className="static-title-rule"></div>

        <div className="static-section">
          <h2 className="static-section-heading">What this is</h2>
          <div className="static-body">
            <p>
              Paper Kites is a mail relay platform for anarchist prisoner support. It serves two purposes: 1) a
              public directory of anarchist prisoners, the facilities holding them, and the groups supporting them; and 2) a
              messaging application through which folks can correspond with prisoners via support group relays.
            </p>
            <p>
              The public directory is maintained by the admin collective, who approve edits and corrections submitted by
              member groups.
            </p>
            <p>
              The message relay platform is for groups and individuals. You join with an invite code from a member
              group, or a group sets up an account for you that you can later claim as your own. Letters are end-to-end
              encrypted and never stored in plaintext on the server.
            </p>
          </div>
        </div>

        <div className="static-section">
          <h2 className="static-section-heading">The relay network</h2>
          <div className="static-body">
            <p>
              Mailing letters internationally is costly and unreliable. A letter sent from the United States to a
              prison in Belarus may cost several dollars in postage, take weeks, and arrive damaged or not at all.
	      Prisoner support work is also often highly local -- with some countries not having any ABC chapters.
	      Writing letters for prisoners abroad helps strengthen local organizing in places where repression and
	      imprisonment is less frequent, but it also provides a deeper pool of potential support for those in
	      local contexts who otherwise might see very little direct support or engagement.
	      Moreover, many comrades flake out of writing letters to prisoners because it's not particularly easy.
	      The goal with this project is to make the process as easy as email or messaging.
            </p>
            <p>
              As folks with a lot of experience in or organizing letter writing nights (and as targets for political repression),
	      this project is basically our technological wishlist and has been in the works for years.
            </p>
            <p>
              When a writer (or org) submits a letter to a prisoner through this site, it goes into a queue for a chosen
              relay group — one that offers to handle printing and physical mailing to that prisoner (and potentially
	      many others). The prisoner gets a letter with a name within the site to respond to and when they mail
	      something back to their local relay group, that group can scan and relay that response letter back in the app to
	      the original writer.
            </p>

          </div>
        </div>

        <div className="static-section">
          <h2 className="static-section-heading">Encryption</h2>
          <div className="static-body">
            {/* Changed: says plainly that the printing group can read the letter (22 Sept). */}
            <p>
              Letters are encrypted in your browser before they leave your device. Our server receives and stores only
              ciphertext — scrambled data that is unreadable without a key. Your password never leaves your device.
            </p>
            <p>
              A letter on this site can be read by you and by the group that prints and mails it (because someone has to print it).
              Within that group, only the volunteers who hold the group's key can read it, and groups are asked to keep
              that circle small. Nobody else can: not the collective running the server, and not anyone who seizes or
              subpoenas it. Although, obviously, once a letter is mailed in the physical mail the local mail carriers can read it
      	      as can the prison authorities. Our encryption scheme can't protect ink on paper, but it can help ensure that
	      hackers or the local government of a writer (writing to a prisoner in a different country) can't get access.
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
              Anarchist Black Cross is a network of autonomous groups providing support to political prisoners
              worldwide. Chapters operate independently in dozens of countries. This platform is a tool built for use by
              ABC chapters and allied groups — it is not a central organization and does not speak for any chapter or the
              network as a whole. If you're interested in learning about the original genesis of the Black Cross, read Shadows in the Struggle for Equality: The History of the Anarchist Red Cross by Boris Yelensky. The brilliant PM Press edition is edited by Matthew Hart and illustrated by N.O. Bonzo.
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
