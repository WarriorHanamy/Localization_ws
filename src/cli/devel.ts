import { getRepoRoot } from "../core/workspace";
import { ROS_DISTRO } from "../core/config";

export async function cmdSource(): Promise<void> {
  const rosSetup = `/opt/ros/${ROS_DISTRO}/setup.bash`;
  const root = getRepoRoot();
  const develSetup = `${root}/devel/setup.bash`;
  const lines = [
    `source ${rosSetup}`,
    `[ -f ${develSetup} ] && source ${develSetup}`,
    `cd ${root}`,
  ];
  console.log(lines.join(" && "));
}
