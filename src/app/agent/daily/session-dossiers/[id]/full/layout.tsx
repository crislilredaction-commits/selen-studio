import styles from "./layout.module.css";

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function FullSessionDossierLayout({ children }: Props) {
  return <div className={styles.scope}>{children}</div>;
}
