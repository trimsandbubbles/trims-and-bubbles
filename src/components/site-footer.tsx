import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
import { InstagramIcon, FacebookIcon, TiktokIcon, YoutubeIcon } from "@/components/social-icons";
import { businessConfig } from "@/config/business";
import { getBusinessDetails } from "@/lib/business-data";
import { EditableText } from "@/components/site-content/editable-text";

export async function SiteFooter() {
  const year = new Date().getFullYear();
  const business = await getBusinessDetails();

  return (
    <footer className="mt-auto border-t border-border bg-sidebar">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Trims & Bubbles" className="h-40 w-auto" />
            </div>
            <EditableText contentKey="footer.tagline" as="p" className="mt-3 text-sm text-muted-foreground">
              {`${businessConfig.tagline}`}
            </EditableText>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Explore</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/services" className="hover:text-foreground">Services &amp; Pricing</Link></li>
              <li><Link href="/about" className="hover:text-foreground">About</Link></li>
              <li><Link href="/gallery" className="hover:text-foreground">Gallery</Link></li>
              <li><Link href="/reviews" className="hover:text-foreground">Reviews</Link></li>
              <li><Link href="/book" className="hover:text-foreground">Book Now</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Account</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/login" className="hover:text-foreground">Client Login</Link></li>
              <li><Link href="/register" className="hover:text-foreground">Create an Account</Link></li>
              <li><Link href="/admin/login" className="hover:text-foreground">Staff Login</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Get in touch</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" /> {business.contactPhone}
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" /> {business.contactEmail}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" /> {businessConfig.location.region}
              </li>
            </ul>
            {(business.instagramUrl || business.facebookUrl || business.tiktokUrl || business.youtubeUrl) && (
              <div className="mt-4 flex gap-3">
                {business.instagramUrl && (
                  <Link
                    href={business.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <InstagramIcon className="h-5 w-5" />
                  </Link>
                )}
                {business.facebookUrl && (
                  <Link
                    href={business.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <FacebookIcon className="h-5 w-5" />
                  </Link>
                )}
                {business.tiktokUrl && (
                  <Link
                    href={business.tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="TikTok"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <TiktokIcon className="h-5 w-5" />
                  </Link>
                )}
                {business.youtubeUrl && (
                  <Link
                    href={business.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="YouTube"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <YoutubeIcon className="h-5 w-5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Trims and Bubbles. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link href="/legal/terms" className="hover:text-foreground">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
