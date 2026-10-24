import { NextRequest,NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { reviewDailyAttendanceEvidence } from "@/lib/server/dailyAttendanceHumanReview";
export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:NextRequest){
 const auth=await requireSupportAgent();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body)return NextResponse.json({error:"Requête invalide."},{status:400});
 const sessionId=String(body.sessionId??"").trim(),slotId=String(body.slotId??"").trim(),enrolmentId=String(body.enrolmentId??"").trim(),decision=body.decision==="validate"||body.decision==="reject"?body.decision:null;
 if(![sessionId,slotId,enrolmentId].every(value=>UUID.test(value))||!decision)return NextResponse.json({error:"Décision de validation invalide."},{status:400});
 try{const result=await reviewDailyAttendanceEvidence({agentEmail:auth.email,reviewerUserId:auth.userId,sessionId,slotId,enrolmentId,decision,reason:String(body.reason??"")});if(!result.ok)return NextResponse.json({error:result.error},{status:result.status});return NextResponse.json(result)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Validation indisponible."},{status:503})}
}
